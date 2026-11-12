fn main() {
    static COMMANDS: &[&str] = &[
        "chill_version",
        "chill_autostart_get",
        "chill_autostart_set",
        "chill_open_external",
        "chill_screen_sources",
        "chill_notify",
        "chill_set_badge",
        "chill_update_check",
        "chill_update_install",
        "chill_activity_ask",
        "chill_take_pending_invite",
    ];
    let attributes = tauri_build::Attributes::new()
        .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS));
    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}
