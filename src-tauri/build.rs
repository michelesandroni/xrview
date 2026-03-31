fn main() {
    // Ensure Cargo recompiles when the bundled XR polyfill changes
    println!("cargo::rerun-if-changed=xr-emulator.js");
    tauri_build::build()
}
