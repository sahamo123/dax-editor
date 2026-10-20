//! Regression tests for handing Tauri's canonical Windows paths to Node.
#![cfg(windows)]
use dax_desktop_lib::sidecar::{node_path, server_args};
use std::path::Path;

#[test]
fn node_arguments_preserve_spaces_and_unicode_without_verbatim_prefixes() {
    let path = Path::new(r"\\?\C:\Users\Example\Dax Editor\café\cli.mjs");
    assert_eq!(node_path(path), Path::new(r"C:\Users\Example\Dax Editor\café\cli.mjs"));
    assert_eq!(node_path(Path::new(r"\\?\UNC\server\share\cli.mjs")), Path::new(r"\\server\share\cli.mjs"));
    let args = server_args(path, Path::new(r"\\?\C:\data dir"), &[]);
    assert_eq!(args[0], r"C:\Users\Example\Dax Editor\café\cli.mjs");
    assert_eq!(args[4], r"C:\data dir");
}
