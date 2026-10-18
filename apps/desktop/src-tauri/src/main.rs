// Binary entry point. All logic lives in the library crate so it can be unit-tested.

// Prevents an extra console window on Windows in release builds. DO NOT REMOVE.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    dax_desktop_lib::run();
}
