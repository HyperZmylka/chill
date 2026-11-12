#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod games;
mod server;

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_deep_link::DeepLinkExt;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub static QUITTING: AtomicBool = AtomicBool::new(false);

fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn deliver_invite(app: &tauri::AppHandle, raw: &str) {
    let Ok(url) = url::Url::parse(raw) else {
        return;
    };
    if url.scheme() != "chill" || url.host_str().unwrap_or("").is_empty() {
        return;
    }
    commands::set_pending_invite(raw);
    show_main(app);
    let _ = app.emit("chill://invite", raw.to_string());
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Otwórz Chill", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Zakończ Chill", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let mut builder = TrayIconBuilder::with_id("chill")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Chill")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "quit" => {
                QUITTING.store(true, Ordering::SeqCst);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main(app);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            commands::chill_version,
            commands::chill_autostart_get,
            commands::chill_autostart_set,
            commands::chill_open_external,
            commands::chill_screen_sources,
            commands::chill_notify,
            commands::chill_set_badge,
            commands::chill_update_check,
            commands::chill_update_install,
            commands::chill_activity_ask,
            commands::chill_take_pending_invite,
        ])
        .setup(|app| {
            setup_tray(app)?;
            if let Err(error) = app.deep_link().register_all() {
                eprintln!("[chill] Rejestracja linków chill:// nie powiodła się: {error}");
            }
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    deliver_invite(&handle, url.as_str());
                }
            });
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for url in urls {
                    deliver_invite(app.handle(), url.as_str());
                }
            }
            server::start(app.handle().clone())?;
            games::start(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if !QUITTING.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Chill desktop failed to start");
}
