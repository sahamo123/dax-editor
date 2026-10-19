//! IPC commands the page may call. Each one must be granted in `capabilities/main.json` (the
//! command list is declared in `build.rs`), so the page can do nothing the shell did not allow.

use std::time::Duration;

use tauri::State;

use crate::server_info::ServerInfo;
use crate::sidecar::ServerManager;

/// How long `get_server_info` waits for a server that is still starting.
const WAIT: Duration = Duration::from_secs(45);

/// Return the engine server's address, token and version, waiting for it to finish starting.
///
/// Fails with a readable message if the server could not start, crashed, or was stopped. The UI
/// should show that message and offer to quit; it must not retry in a tight loop.
#[tauri::command]
pub async fn get_server_info(manager: State<'_, ServerManager>) -> Result<ServerInfo, String> {
    manager.wait_ready(WAIT).await
}
