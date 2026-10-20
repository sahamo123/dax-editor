//! The dax-editor desktop shell: a small Tauri 2 host that opens the window, offers the native
//! open-file dialog and drag-and-drop, and runs the engine server as a sidecar process.
//!
//! The shell deliberately does very little. All editing logic lives in the TypeScript engine
//! (`packages/core`, served by `packages/server`); the UI talks to that server over loopback HTTP
//! and WebSocket using the address and token returned by the [`commands::get_server_info`] command.

mod commands;
pub mod guard;
pub mod health;
pub mod server_info;
pub mod sidecar;

use std::time::Duration;

use tauri::{Emitter, Manager, RunEvent, WindowEvent};

use crate::sidecar::{LaunchConfig, ServerManager, ServerStatus};

/// Name of the page event carrying server status changes (`{ state, message }`, no secrets).
pub const STATUS_EVENT: &str = "dax://server-status";

/// Web origins the server must accept. These are the origins the Tauri webview reports for the
/// app's own pages on macOS/Linux (`tauri://localhost`) and Windows (`http://tauri.localhost`).
const APP_ORIGINS: [&str; 3] = [
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
];

/// Build the launch configuration for the sidecar from the running app.
fn launch_config<R: tauri::Runtime>(app: &tauri::App<R>) -> Result<LaunchConfig, String> {
    let exe = std::env::current_exe().map_err(|e| format!("cannot locate the app binary: {e}"))?;
    let exe_dir = exe
        .parent()
        .ok_or("the app binary has no parent directory")?
        .to_path_buf();
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("cannot locate resources: {e}"))?;
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("cannot locate the app data directory: {e}"))?
        .join("server");

    let mut origins: Vec<String> = APP_ORIGINS.iter().map(|s| s.to_string()).collect();
    if cfg!(debug_assertions) {
        // `tauri dev` serves the UI from the Vite dev server; its origin must be allowed too.
        if let Some(dev) = &app.config().build.dev_url {
            origins.push(dev.origin().ascii_serialization());
        }
    }

    let env = |name: &str| std::env::var_os(name);
    let paths = sidecar::resolve_paths(
        &exe_dir,
        &resource_dir,
        &env,
        cfg!(debug_assertions),
        &|p| p.exists(),
    );
    let token = server_info::generate_token().map_err(|e| format!("no secure randomness: {e}"))?;
    Ok(LaunchConfig {
        paths,
        data_dir,
        origins,
        token,
        // First launch verifies/copies bundled model bytes and loads the offline CPU model.
        startup_timeout: Duration::from_secs(120),
        shutdown_grace: Duration::from_secs(3),
    })
}

/// Run the desktop app. Blocks until the app exits.
///
/// # Panics
///
/// Panics if the Tauri application cannot be built (a broken `tauri.conf.json`, for example).
pub fn run() {
    let manager = ServerManager::new();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(manager.clone())
        .invoke_handler(tauri::generate_handler![commands::get_server_info])
        .setup(|app| {
            let handle = app.handle().clone();
            let manager = app.state::<ServerManager>().inner().clone();
            let on_status = move |status: &ServerStatus| {
                // Failing to emit just means no window is listening yet; the page can always
                // ask `get_server_info`.
                let _ = handle.emit(STATUS_EVENT, status.to_event());
            };
            match launch_config(app) {
                Ok(cfg) => manager.start(cfg, on_status)?,
                Err(why) => {
                    // Surface the problem to the page instead of crashing the app.
                    eprintln!("[shell] cannot launch the engine server: {why}");
                    on_status(&ServerStatus::Failed(why));
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // One window app: closing it quits, on every platform (including macOS, where
            // apps usually stay alive). Otherwise the engine server would keep running with
            // nothing to serve.
            if let WindowEvent::Destroyed = event {
                if window.label() == "main" {
                    window.app_handle().exit(0);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building the Tauri application");

    app.run(move |_handle, event| {
        if let RunEvent::Exit = event {
            // Last chance: stop the server and its children before the process ends.
            manager.shutdown();
        }
    });
}
