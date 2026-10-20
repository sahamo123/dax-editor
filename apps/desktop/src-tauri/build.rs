// Build script: declares the app's own IPC commands to the Tauri permission system (so each one
// needs an explicit capability grant) and runs the standard Tauri codegen.

fn main() {
    let attributes = tauri_build::Attributes::new()
        .app_manifest(tauri_build::AppManifest::new().commands(&["get_server_info"]));
    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}
