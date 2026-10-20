//! Launching, supervising and stopping the engine-server sidecar.
//!
//! The server is a Node program (`dax-server`, see `docs/specs/product-v1.md`). The shell starts the
//! bundled Node runtime (`dax-node`, a Tauri `externalBin`) on the bundled server script, hands it
//! a random token, waits for the one-line `ServerInfo` JSON on stdout, checks `/api/health`, and
//! publishes the result to the UI. It stops the server on window close and app exit.
//!
//! The contract with the server (also documented in `AGENTS.md`):
//!
//! * argv: `<server entry> --port 0 --data-dir <dir> --origin <o>...`
//! * env: `DAX_SERVER_TOKEN` (the token to require), `DAX_FFMPEG` / `DAX_FFPROBE` (bundled binaries)
//! * stdout: one `ServerInfo` JSON line when ready (other lines are treated as logs)
//! * stdin: a pipe held by the shell; end-of-input means "the app is gone, exit now"
//! * SIGTERM (Unix): clean up children and exit
//!
//! This module has no dependency on Tauri so it can be tested with plain `cargo test`.

use std::collections::VecDeque;
use std::ffi::OsString;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tokio::sync::watch;

use crate::guard::{self, GroupSignal};
use crate::health::probe_health;
use crate::server_info::{parse_server_info_line, InfoError, ServerInfo};

/// Environment variable through which the server receives its bearer token. The token is passed in
/// the environment, not argv, because command lines are visible to other local users in `ps`.
pub const TOKEN_ENV: &str = "DAX_SERVER_TOKEN";

/// How many trailing server output lines are kept to explain a failed start.
const TAIL_LINES: usize = 40;

/// Where the pieces of the engine server live on disk.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SidecarPaths {
    /// The Node runtime executable.
    pub node: PathBuf,
    /// The server entry script handed to Node.
    pub entry: PathBuf,
    /// Bundled FFmpeg, if present (the server falls back to `PATH` when absent).
    pub ffmpeg: Option<PathBuf>,
    /// Bundled ffprobe, if present.
    pub ffprobe: Option<PathBuf>,
}

fn exe_name(base: &str) -> String {
    if cfg!(windows) {
        format!("{base}.exe")
    } else {
        base.to_string()
    }
}

/// Work out where the sidecar pieces are.
///
/// Tauri places `externalBin` programs next to the main executable (`exe_dir`) with the target
/// triple stripped, and resources under `resource_dir`. `env` looks up environment variables.
/// When `allow_overrides` is true (debug builds only) `DAX_NODE` and `DAX_SERVER_ENTRY` replace the
/// bundled Node and server script, so a developer can run the real `packages/server/dist/cli.js`
/// without bundling. Release builds ignore them, so a stray variable can never redirect a shipped
/// app to run other code.
pub fn resolve_paths(
    exe_dir: &Path,
    resource_dir: &Path,
    env: &dyn Fn(&str) -> Option<OsString>,
    allow_overrides: bool,
    exists: &dyn Fn(&Path) -> bool,
) -> SidecarPaths {
    let override_var = |name: &str| {
        if allow_overrides {
            env(name).filter(|v| !v.is_empty()).map(PathBuf::from)
        } else {
            None
        }
    };
    let optional = |base: &str| {
        let p = exe_dir.join(exe_name(base));
        exists(&p).then_some(p)
    };
    SidecarPaths {
        node: override_var("DAX_NODE").unwrap_or_else(|| exe_dir.join(exe_name("dax-node"))),
        entry: override_var("DAX_SERVER_ENTRY")
            .unwrap_or_else(|| resource_dir.join("server").join("cli.mjs")),
        ffmpeg: optional("dax-ffmpeg"),
        ffprobe: optional("dax-ffprobe"),
    }
}

/// Everything needed to start one server process.
#[derive(Debug, Clone)]
pub struct LaunchConfig {
    /// Executable and script locations.
    pub paths: SidecarPaths,
    /// Directory the server keeps projects, caches and settings in (`--data-dir`).
    pub data_dir: PathBuf,
    /// Web origins the server must accept (`--origin`, one flag each).
    pub origins: Vec<String>,
    /// The per-launch bearer token the server must require.
    pub token: String,
    /// How long the server may take to print its info line and pass the health check.
    pub startup_timeout: Duration,
    /// How long a stopping server gets to exit on its own before it is killed.
    pub shutdown_grace: Duration,
}

/// The command-line arguments passed to the server entry script.
pub fn server_args(entry: &Path, data_dir: &Path, origins: &[String]) -> Vec<OsString> {
    let mut args: Vec<OsString> = vec![
        node_path(entry).into_os_string(),
        "--port".into(),
        "0".into(),
        "--data-dir".into(),
        node_path(data_dir).into_os_string(),
    ];
    for origin in origins {
        args.push("--origin".into());
        args.push(origin.into());
    }
    args
}

/// Strip Windows verbatim drive/UNC prefixes before handing paths to Node's realpath parser.
/// Node 22 rejects a verbatim drive path with EISDIR for `C:`. Preserve UTF-16 without lossy conversion.
pub fn node_path(path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::{OsStrExt, OsStringExt};
        let wide: Vec<u16> = path.as_os_str().encode_wide().collect();
        let prefix: Vec<u16> = r"\\?\".encode_utf16().collect();
        let unc: Vec<u16> = r"\\?\UNC\".encode_utf16().collect();
        if wide.starts_with(&unc) {
            let mut normal: Vec<u16> = r"\\".encode_utf16().collect();
            normal.extend_from_slice(&wide[unc.len()..]);
            return OsString::from_wide(&normal).into();
        }
        if wide.starts_with(&prefix) && wide.get(5) == Some(&(b':' as u16)) {
            return OsString::from_wide(&wide[prefix.len()..]).into();
        }
    }
    path.to_path_buf()
}

/// Build the (not yet spawned) command for the server: arguments, environment, and the three
/// pipes. Platform safety nets are added separately by [`guard::configure_command`].
pub fn build_command(cfg: &LaunchConfig) -> Command {
    let mut cmd = Command::new(&cfg.paths.node);
    cmd.args(server_args(&cfg.paths.entry, &cfg.data_dir, &cfg.origins));
    cmd.env(TOKEN_ENV, &cfg.token);
    if let Some(ffmpeg) = &cfg.paths.ffmpeg {
        cmd.env("DAX_FFMPEG", node_path(ffmpeg));
    }
    if let Some(ffprobe) = &cfg.paths.ffprobe {
        cmd.env("DAX_FFPROBE", node_path(ffprobe));
    }
    // A user's NODE_OPTIONS or NODE_PATH could preload or substitute code in the engine; the
    // shipped server is a self-contained bundle, so the app never wants either.
    cmd.env_remove("NODE_OPTIONS").env_remove("NODE_PATH");
    cmd.env("NODE_ENV", "production");
    // Run from the data dir: harmless for the server, and keeps the app directory un-locked on
    // Windows so the installer can replace it.
    cmd.current_dir(node_path(&cfg.data_dir));
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cmd
}

/// Lifecycle of the server as seen by the UI.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ServerStatus {
    /// Launched (or about to be); no usable info yet.
    Starting,
    /// Listening and healthy; the info is what the page needs.
    Ready(ServerInfo),
    /// Could not start, or died unexpectedly. The text is safe to show (it never holds the token).
    Failed(String),
    /// Stopped on purpose (shutdown).
    Stopped,
}

/// A secret-free description of a [`ServerStatus`], emitted to the page as an event.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct StatusEvent {
    /// One of `starting`, `ready`, `failed`, `stopped`.
    pub state: &'static str,
    /// Explanation for `failed`.
    pub message: Option<String>,
}

impl ServerStatus {
    /// The page-facing event for this status (never contains the token).
    pub fn to_event(&self) -> StatusEvent {
        match self {
            ServerStatus::Starting => StatusEvent {
                state: "starting",
                message: None,
            },
            ServerStatus::Ready(_) => StatusEvent {
                state: "ready",
                message: None,
            },
            ServerStatus::Failed(m) => StatusEvent {
                state: "failed",
                message: Some(m.clone()),
            },
            ServerStatus::Stopped => StatusEvent {
                state: "stopped",
                message: None,
            },
        }
    }
}

enum Msg {
    Info(ServerInfo),
    BadInfo(String),
    StdoutClosed,
    Shutdown,
}

struct Inner {
    status: watch::Sender<ServerStatus>,
    control: Mutex<Option<Sender<Msg>>>,
    /// True once the supervisor thread has finished and the child is gone.
    done: (Mutex<bool>, Condvar),
}

/// Owns the sidecar process. Cheap to clone; all clones share one server.
#[derive(Clone)]
pub struct ServerManager {
    inner: Arc<Inner>,
}

impl Default for ServerManager {
    fn default() -> Self {
        Self::new()
    }
}

impl ServerManager {
    /// A manager with no server running yet (status `Starting`, so early `get_server_info` calls
    /// wait instead of failing).
    pub fn new() -> Self {
        let (status, _rx) = watch::channel(ServerStatus::Starting);
        ServerManager {
            inner: Arc::new(Inner {
                status,
                control: Mutex::new(None),
                done: (Mutex::new(false), Condvar::new()),
            }),
        }
    }

    /// Start the server on a dedicated supervisor thread and return immediately.
    ///
    /// `on_status` is called from that thread on every status change (the app uses it to emit a
    /// page event). The server is spawned *from the supervisor thread* because Linux ties
    /// `PR_SET_PDEATHSIG` to the spawning thread; this thread lives as long as the server does.
    pub fn start<F>(&self, cfg: LaunchConfig, on_status: F) -> std::io::Result<()>
    where
        F: Fn(&ServerStatus) + Send + 'static,
    {
        let (tx, rx) = mpsc::channel();
        *lock(&self.inner.control) = Some(tx.clone());
        let inner = Arc::clone(&self.inner);
        thread::Builder::new()
            .name("dax-sidecar-supervisor".into())
            .spawn(move || {
                let publish = |s: ServerStatus| {
                    on_status(&s);
                    inner.status.send_replace(s);
                };
                supervise(&cfg, rx, tx, &publish);
                let (flag, cv) = &inner.done;
                *lock(flag) = true;
                cv.notify_all();
            })?;
        Ok(())
    }

    /// The current status.
    pub fn status(&self) -> ServerStatus {
        self.inner.status.borrow().clone()
    }

    /// Wait until the server is ready and return its info, or an explanation if it failed,
    /// stopped, or did not become ready within `timeout`.
    pub async fn wait_ready(&self, timeout: Duration) -> Result<ServerInfo, String> {
        let mut rx = self.inner.status.subscribe();
        let wait = async {
            loop {
                match &*rx.borrow_and_update() {
                    ServerStatus::Ready(info) => return Ok(info.clone()),
                    ServerStatus::Failed(why) => return Err(why.clone()),
                    ServerStatus::Stopped => return Err("the engine server was stopped".into()),
                    ServerStatus::Starting => {}
                }
                if rx.changed().await.is_err() {
                    return Err("the engine server manager was dropped".into());
                }
            }
        };
        tokio::time::timeout(timeout, wait)
            .await
            .unwrap_or_else(|_| Err("timed out waiting for the engine server".into()))
    }

    /// Stop the server and everything it started, then return. Idempotent and safe to call from
    /// any thread, including when the server never started. Blocks for at most a few seconds.
    pub fn shutdown(&self) {
        if let Some(tx) = lock(&self.inner.control).as_ref() {
            // A send error just means the supervisor already finished.
            let _ = tx.send(Msg::Shutdown);
        } else {
            return;
        }
        let (flag, cv) = &self.inner.done;
        let guard = lock(flag);
        let _ = cv
            .wait_timeout_while(guard, Duration::from_secs(15), |done| !*done)
            .unwrap_or_else(|e| e.into_inner());
    }
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// The running child plus everything needed to stop it.
struct Running {
    child: Child,
    stdin: Option<ChildStdin>,
    pid: u32,
    tail: Arc<Mutex<VecDeque<String>>>,
    // Held for its Drop: on Windows, closing the job handle kills leftovers.
    _guard: Option<guard::Guard>,
}

impl Running {
    fn tail_text(&self) -> String {
        let tail = lock(&self.tail);
        tail.iter().cloned().collect::<Vec<_>>().join("\n")
    }

    /// Stop the server: close stdin (the protocol's "exit now"), ask the whole process group to
    /// terminate, wait up to `grace`, then kill. Finally make sure no group member lingers.
    fn stop(&mut self, grace: Duration) {
        drop(self.stdin.take());
        guard::signal_group(self.pid, GroupSignal::Term);
        if !wait_exit(&mut self.child, grace) {
            guard::signal_group(self.pid, GroupSignal::Kill);
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
        self.reap_group();
    }

    /// After the leader exited, give leftover group members (e.g. FFmpeg) a moment, then kill.
    fn reap_group(&self) {
        let end = Instant::now() + Duration::from_secs(1);
        while guard::group_exists(self.pid) && Instant::now() < end {
            thread::sleep(Duration::from_millis(20));
        }
        if guard::group_exists(self.pid) {
            guard::signal_group(self.pid, GroupSignal::Kill);
        }
    }
}

fn wait_exit(child: &mut Child, grace: Duration) -> bool {
    let end = Instant::now() + grace;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => return true,
            Ok(None) => {}
            Err(_) => return true,
        }
        if Instant::now() >= end {
            return false;
        }
        thread::sleep(Duration::from_millis(20));
    }
}

fn push_tail(tail: &Mutex<VecDeque<String>>, line: &str) {
    let mut tail = lock(tail);
    if tail.len() >= TAIL_LINES {
        tail.pop_front();
    }
    tail.push_back(line.to_string());
}

fn spawn_readers(child: &mut Child, tx: Sender<Msg>, tail: Arc<Mutex<VecDeque<String>>>) {
    if let Some(stdout) = child.stdout.take() {
        let tail = Arc::clone(&tail);
        thread::Builder::new()
            .name("dax-sidecar-stdout".into())
            .spawn(move || {
                let mut announced = false;
                // The pipe must be drained for the server's whole life, or it would block on a
                // full pipe; so keep reading after the handshake.
                for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                    if !announced {
                        match parse_server_info_line(&line) {
                            Ok(info) => {
                                announced = true;
                                let _ = tx.send(Msg::Info(info));
                                continue;
                            }
                            Err(InfoError::Invalid(why)) => {
                                announced = true;
                                let _ = tx.send(Msg::BadInfo(why));
                                continue;
                            }
                            Err(InfoError::NotInfo) => {}
                        }
                    }
                    push_tail(&tail, &line);
                    eprintln!("[server] {line}");
                }
                let _ = tx.send(Msg::StdoutClosed);
            })
            .ok();
    }
    if let Some(stderr) = child.stderr.take() {
        thread::Builder::new()
            .name("dax-sidecar-stderr".into())
            .spawn(move || {
                for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                    push_tail(&tail, &line);
                    eprintln!("[server] {line}");
                }
            })
            .ok();
    }
}

/// The supervisor: spawn, wait for readiness, then watch until exit or a shutdown request.
fn supervise(
    cfg: &LaunchConfig,
    rx: Receiver<Msg>,
    tx: Sender<Msg>,
    publish: &dyn Fn(ServerStatus),
) {
    if let Err(e) = std::fs::create_dir_all(&cfg.data_dir) {
        publish(ServerStatus::Failed(format!(
            "cannot create data directory {}: {e}",
            cfg.data_dir.display()
        )));
        return;
    }
    let mut cmd = build_command(cfg);
    guard::configure_command(&mut cmd);
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            publish(ServerStatus::Failed(format!(
                "cannot start the engine server ({}): {e}",
                cfg.paths.node.display()
            )));
            return;
        }
    };
    let pid = child.id();
    let tail = Arc::new(Mutex::new(VecDeque::new()));
    let stdin = child.stdin.take();
    let guard = guard::attach(&child);
    spawn_readers(&mut child, tx, Arc::clone(&tail));
    let mut run = Running {
        child,
        stdin,
        pid,
        tail,
        _guard: guard,
    };

    let deadline = Instant::now() + cfg.startup_timeout;
    let mut pending: Option<ServerInfo> = None;
    let mut ready = false;
    let mut last_probe_error = String::from("the server never printed its address");

    loop {
        match rx.recv_timeout(Duration::from_millis(50)) {
            Ok(Msg::Shutdown) => {
                run.stop(cfg.shutdown_grace);
                publish(ServerStatus::Stopped);
                return;
            }
            Ok(Msg::Info(info)) => {
                if pending.is_none() && !ready {
                    pending = Some(info);
                }
            }
            Ok(Msg::BadInfo(why)) => {
                run.stop(cfg.shutdown_grace);
                publish(ServerStatus::Failed(format!(
                    "the engine server sent an unusable address: {why}"
                )));
                return;
            }
            Ok(Msg::StdoutClosed) | Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => {}
        }

        if let Ok(Some(status)) = run.child.try_wait() {
            // Give the output readers a moment to deliver the final lines for the message.
            thread::sleep(Duration::from_millis(100));
            let tail = run.tail_text();
            run.reap_group();
            publish(ServerStatus::Failed(format!(
                "the engine server exited unexpectedly ({status}){}",
                if tail.is_empty() {
                    String::new()
                } else {
                    format!("\n{tail}")
                }
            )));
            return;
        }

        if let Some(info) = &pending {
            match probe_health(info, Duration::from_secs(2)) {
                Ok(()) => {
                    publish(ServerStatus::Ready(info.clone()));
                    pending = None;
                    ready = true;
                }
                Err(e) => {
                    last_probe_error = e;
                    thread::sleep(Duration::from_millis(100));
                }
            }
        }

        if !ready && Instant::now() >= deadline {
            let tail = run.tail_text();
            run.stop(cfg.shutdown_grace);
            publish(ServerStatus::Failed(format!(
                "the engine server did not become ready in {}s: {last_probe_error}{}",
                cfg.startup_timeout.as_secs(),
                if tail.is_empty() {
                    String::new()
                } else {
                    format!("\n{tail}")
                }
            )));
            return;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn no_env(_: &str) -> Option<OsString> {
        None
    }

    #[test]
    fn paths_follow_the_bundle_layout() {
        let exe_dir = Path::new("/opt/dax");
        let res = Path::new("/opt/dax/lib");
        let p = resolve_paths(exe_dir, res, &no_env, false, &|_| true);
        assert_eq!(p.node, exe_dir.join(exe_name("dax-node")));
        assert_eq!(p.entry, res.join("server").join("cli.mjs"));
        assert_eq!(p.ffmpeg, Some(exe_dir.join(exe_name("dax-ffmpeg"))));
        assert_eq!(p.ffprobe, Some(exe_dir.join(exe_name("dax-ffprobe"))));
    }

    #[test]
    fn missing_ffmpeg_is_none() {
        let p = resolve_paths(Path::new("/a"), Path::new("/b"), &no_env, false, &|_| false);
        assert_eq!(p.ffmpeg, None);
        assert_eq!(p.ffprobe, None);
    }

    #[test]
    fn overrides_apply_only_when_allowed() {
        let env = |k: &str| match k {
            "DAX_NODE" => Some(OsString::from("/usr/bin/node")),
            "DAX_SERVER_ENTRY" => Some(OsString::from("/repo/cli.js")),
            _ => None,
        };
        let dev = resolve_paths(Path::new("/a"), Path::new("/b"), &env, true, &|_| false);
        assert_eq!(dev.node, PathBuf::from("/usr/bin/node"));
        assert_eq!(dev.entry, PathBuf::from("/repo/cli.js"));
        let release = resolve_paths(Path::new("/a"), Path::new("/b"), &env, false, &|_| false);
        assert_eq!(release.node, Path::new("/a").join(exe_name("dax-node")));
        assert_eq!(release.entry, Path::new("/b/server/cli.mjs"));
    }

    #[test]
    fn empty_override_is_ignored() {
        let env = |_: &str| Some(OsString::new());
        let p = resolve_paths(Path::new("/a"), Path::new("/b"), &env, true, &|_| false);
        assert_eq!(p.entry, Path::new("/b/server/cli.mjs"));
    }

    #[test]
    fn args_pass_port_zero_data_dir_and_every_origin() {
        let args = server_args(
            Path::new("/s/cli.mjs"),
            Path::new("/data"),
            &["tauri://localhost".into(), "http://tauri.localhost".into()],
        );
        let args: Vec<String> = args
            .iter()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            args,
            [
                "/s/cli.mjs",
                "--port",
                "0",
                "--data-dir",
                "/data",
                "--origin",
                "tauri://localhost",
                "--origin",
                "http://tauri.localhost"
            ]
        );
    }

    fn test_config() -> LaunchConfig {
        LaunchConfig {
            paths: SidecarPaths {
                node: "/n/dax-node".into(),
                entry: "/s/cli.mjs".into(),
                ffmpeg: Some("/n/ffmpeg".into()),
                ffprobe: None,
            },
            data_dir: "/data".into(),
            origins: vec![],
            token: "tok".into(),
            startup_timeout: Duration::from_secs(1),
            shutdown_grace: Duration::from_secs(1),
        }
    }

    #[test]
    fn token_goes_in_the_environment_never_argv() {
        let cmd = build_command(&test_config());
        assert!(cmd.get_args().all(|a| a != "tok"));
        let envs: Vec<_> = cmd.get_envs().collect();
        assert!(envs
            .iter()
            .any(|(k, v)| *k == TOKEN_ENV && *v == Some("tok".as_ref())));
        assert!(envs
            .iter()
            .any(|(k, v)| *k == "DAX_FFMPEG" && *v == Some("/n/ffmpeg".as_ref())));
        assert!(!envs.iter().any(|(k, _)| *k == "DAX_FFPROBE"));
        assert!(envs.iter().any(|(k, v)| *k == "NODE_PATH" && v.is_none()));
        // NODE_OPTIONS is explicitly removed (set to None).
        assert!(envs
            .iter()
            .any(|(k, v)| *k == "NODE_OPTIONS" && v.is_none()));
    }

    #[test]
    fn status_events_never_carry_the_token() {
        let info = ServerInfo {
            url: "http://127.0.0.1:1".into(),
            token: "super-secret".into(),
            port: 1,
            version: "0".into(),
        };
        let ev = ServerStatus::Ready(info).to_event();
        assert_eq!(ev.state, "ready");
        assert!(!serde_json::to_string(&ev).unwrap().contains("super-secret"));
        let failed = ServerStatus::Failed("boom".into()).to_event();
        assert_eq!(failed.message.as_deref(), Some("boom"));
    }

    #[test]
    fn shutdown_without_start_returns_immediately() {
        ServerManager::new().shutdown();
    }

    #[test]
    fn a_missing_node_binary_reports_failure() {
        let mut cfg = test_config();
        cfg.data_dir = std::env::temp_dir().join("dax-sidecar-test-missing-node");
        cfg.paths.node = "/definitely/not/here/dax-node".into();
        let manager = ServerManager::new();
        manager.start(cfg, |_| {}).unwrap();
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .unwrap();
        let err = rt
            .block_on(manager.wait_ready(Duration::from_secs(5)))
            .unwrap_err();
        assert!(err.contains("cannot start the engine server"), "{err}");
    }
}
