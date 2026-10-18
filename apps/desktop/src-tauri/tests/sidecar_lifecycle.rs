// Integration tests for the sidecar supervisor with a real Node process: ready handshake, failed
// starts, unexpected exits, and shutdown that leaves no process behind. Skipped (with a message)
// when `node` is not on PATH. Unix only: the checks use process ids and signals.
#![cfg(unix)]

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

use dax_desktop_lib::server_info::ServerInfo;
use dax_desktop_lib::sidecar::{LaunchConfig, ServerManager, ServerStatus, SidecarPaths};

fn node() -> Option<PathBuf> {
    let out = Command::new("sh")
        .args(["-c", "command -v node"])
        .output()
        .ok()?;
    let path = String::from_utf8(out.stdout).ok()?.trim().to_string();
    (!path.is_empty()).then(|| PathBuf::from(path))
}

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("dax-lifecycle-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn config(node: PathBuf, entry: &Path, data: &Path) -> LaunchConfig {
    LaunchConfig {
        paths: SidecarPaths {
            node,
            entry: entry.to_path_buf(),
            ffmpeg: None,
            ffprobe: None,
        },
        data_dir: data.join("data"),
        origins: vec!["tauri://localhost".into()],
        token: "lifecycle-token".into(),
        startup_timeout: Duration::from_secs(5),
        shutdown_grace: Duration::from_secs(3),
    }
}

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_time()
        .build()
        .unwrap()
}

/// Whether `pid` is a live process. A zombie (killed but not yet reaped by its parent or init)
/// counts as dead, because it no longer runs anything.
fn alive(pid: u32) -> bool {
    if let Ok(stat) = fs::read_to_string(format!("/proc/{pid}/stat")) {
        // Format: `pid (comm) S ...`; comm may contain spaces, so split after the last `)`.
        let state = stat
            .rsplit(')')
            .next()
            .and_then(|r| r.trim().chars().next());
        return state != Some('Z');
    }
    // SAFETY: signal 0 only checks that the process exists.
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

/// A minimal compliant server: prints ServerInfo, answers /api/health, exits when stdin ends.
const GOOD_SERVER: &str = r#"
const http = require("node:http");
const s = http.createServer((q, r) => { r.writeHead(200); r.end("{}"); });
s.listen(0, "127.0.0.1", () => {
  const port = s.address().port;
  console.log(JSON.stringify({ url: "http://127.0.0.1:" + port, token: process.env.DAX_SERVER_TOKEN, port, version: "t" }));
  console.error("pid " + process.pid);
});
process.stdin.on("end", () => process.exit(0));
process.stdin.resume();
"#;

#[test]
fn ready_then_shutdown_leaves_no_process() {
    let Some(node) = node() else {
        eprintln!("skipped: node not on PATH");
        return;
    };
    let dir = temp_dir("ok");
    let entry = dir.join("server.cjs");
    fs::write(&entry, GOOD_SERVER).unwrap();

    let manager = ServerManager::new();
    manager.start(config(node, &entry, &dir), |_| {}).unwrap();
    let info: ServerInfo = runtime()
        .block_on(manager.wait_ready(Duration::from_secs(10)))
        .expect("server becomes ready");
    assert_eq!(
        info.token, "lifecycle-token",
        "token reaches the server via the environment"
    );
    assert!(matches!(manager.status(), ServerStatus::Ready(_)));

    manager.shutdown();
    assert_eq!(manager.status(), ServerStatus::Stopped);
    // The health port no longer answers.
    assert!(dax_desktop_lib::health::probe_health(&info, Duration::from_millis(300)).is_err());
    manager.shutdown(); // idempotent
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn server_that_exits_before_ready_is_reported_with_its_output() {
    let Some(node) = node() else {
        return;
    };
    let dir = temp_dir("early");
    let entry = dir.join("server.cjs");
    fs::write(
        &entry,
        "console.error('boom: bad config'); process.exit(3);",
    )
    .unwrap();
    let manager = ServerManager::new();
    manager.start(config(node, &entry, &dir), |_| {}).unwrap();
    let err = runtime()
        .block_on(manager.wait_ready(Duration::from_secs(10)))
        .unwrap_err();
    assert!(err.contains("exited unexpectedly"), "{err}");
    assert!(err.contains("boom: bad config"), "{err}");
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn unusable_info_line_fails_the_start_and_stops_the_server() {
    let Some(node) = node() else {
        return;
    };
    let dir = temp_dir("bad");
    let entry = dir.join("server.cjs");
    fs::write(
        &entry,
        r#"console.log(JSON.stringify({url:"http://evil.example:80",token:"t",port:80,version:"1"}));
           console.error("pid " + process.pid); process.stdin.resume();"#,
    )
    .unwrap();
    let manager = ServerManager::new();
    manager.start(config(node, &entry, &dir), |_| {}).unwrap();
    let err = runtime()
        .block_on(manager.wait_ready(Duration::from_secs(10)))
        .unwrap_err();
    assert!(err.contains("unusable address"), "{err}");
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn silent_server_times_out_and_is_killed() {
    let Some(node) = node() else {
        return;
    };
    let dir = temp_dir("silent");
    let entry = dir.join("server.cjs");
    // Never prints anything and ignores stdin end-of-input and SIGTERM: only SIGKILL stops it.
    fs::write(
        &entry,
        "process.on('SIGTERM', () => {}); process.stdin.resume(); setInterval(() => {}, 1000);",
    )
    .unwrap();
    let mut cfg = config(node, &entry, &dir);
    cfg.startup_timeout = Duration::from_millis(800);
    cfg.shutdown_grace = Duration::from_millis(500);
    let manager = ServerManager::new();
    manager.start(cfg, |_| {}).unwrap();
    let err = runtime()
        .block_on(manager.wait_ready(Duration::from_secs(10)))
        .unwrap_err();
    assert!(err.contains("did not become ready"), "{err}");
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn stubborn_server_is_killed_with_its_children_on_shutdown() {
    let Some(node) = node() else {
        return;
    };
    let dir = temp_dir("stubborn");
    let entry = dir.join("server.cjs");
    let pids = dir.join("pids");
    // Ready, then ignores SIGTERM and stdin, and starts a grandchild: shutdown must SIGKILL both.
    fs::write(
        &entry,
        format!(
            r#"
const http = require("node:http");
const cp = require("node:child_process");
const fs = require("node:fs");
process.on("SIGTERM", () => {{}});
const child = cp.spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{{}});setInterval(()=>{{}},1000)"], {{ stdio: "ignore" }});
fs.writeFileSync({pids:?}, process.pid + " " + child.pid);
const s = http.createServer((q, r) => {{ r.writeHead(200); r.end("{{}}"); }});
s.listen(0, "127.0.0.1", () => {{
  const port = s.address().port;
  console.log(JSON.stringify({{ url: "http://127.0.0.1:" + port, token: process.env.DAX_SERVER_TOKEN, port, version: "t" }}));
}});
process.stdin.resume();
"#,
            pids = pids.to_str().unwrap()
        ),
    )
    .unwrap();
    let mut cfg = config(node, &entry, &dir);
    cfg.shutdown_grace = Duration::from_millis(500);
    let manager = ServerManager::new();
    manager.start(cfg, |_| {}).unwrap();
    runtime()
        .block_on(manager.wait_ready(Duration::from_secs(10)))
        .expect("ready");
    let recorded = fs::read_to_string(&pids).unwrap();
    let ids: Vec<u32> = recorded
        .split_whitespace()
        .map(|p| p.parse().unwrap())
        .collect();
    assert_eq!(ids.len(), 2);
    assert!(ids.iter().all(|p| alive(*p)));

    manager.shutdown();
    // Give the kernel a moment to reap; both must be gone.
    std::thread::sleep(Duration::from_millis(200));
    for pid in ids {
        assert!(!alive(pid), "process {pid} survived shutdown");
    }
    let _ = fs::remove_dir_all(&dir);
}
