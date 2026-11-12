use std::path::PathBuf;
use std::time::Duration;

use anyhow::{anyhow, Context};
use chill_server::config::Config;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const DEFAULT_PORT: u16 = 47830;
const PORT_ATTEMPTS: u16 = 10;

pub fn start(app: AppHandle) -> anyhow::Result<()> {
    let data_dir = data_dir();
    let web_root = web_root(&app)?;
    let base_port = std::env::var("CHILL_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(DEFAULT_PORT);
    let public = std::env::var("CHILL_PUBLIC_WEB").map(|value| value == "1").unwrap_or(false);
    let public_url = std::env::var("CHILL_PUBLIC_URL").ok();

    let (tx, rx) = std::sync::mpsc::channel::<anyhow::Result<u16>>();
    std::thread::spawn(move || {
        let runtime = match tokio::runtime::Runtime::new() {
            Ok(runtime) => runtime,
            Err(error) => {
                let _ = tx.send(Err(error.into()));
                return;
            }
        };
        runtime.block_on(async move {
            let mut port = base_port;
            let started = loop {
                let mut config = Config::desktop(data_dir.clone(), web_root.clone());
                config.port = port;
                config.public_web = public;
                config.public_origin = public_url.clone();
                match chill_server::start(config).await {
                    Ok(started) => break Ok(started),
                    Err(error) => {
                        if port != 0 && port < base_port.saturating_add(PORT_ATTEMPTS) {
                            port += 1;
                            continue;
                        }
                        break Err(error);
                    }
                }
            };

            match started {
                Ok(started) => {
                    let port = started.address.port();
                    let _ = tx.send(Ok(port));
                    if let Err(error) = started.task.await {
                        eprintln!("[chill] Zadanie serwera przerwane: {error}");
                    }
                }
                Err(error) => {
                    let _ = tx.send(Err(error));
                }
            }
        });
    });

    let port = rx
        .recv_timeout(Duration::from_secs(20))
        .context("Serwer Chill nie wystartował na czas.")??;
    let url = format!("http://127.0.0.1:{port}");

    let handle = app.clone();
    app.run_on_main_thread(move || {
        if let Err(error) = create_window(&handle, &url) {
            eprintln!("[chill] Nie udało się otworzyć okna: {error}");
        }
    })?;
    Ok(())
}

fn create_window(app: &AppHandle, url: &str) -> anyhow::Result<()> {
    let parsed = url::Url::parse(url)?;
    let hidden = std::env::args().any(|arg| arg == "--hidden");
    let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(parsed))
        .title("Chill")
        .inner_size(1320.0, 860.0)
        .min_inner_size(940.0, 600.0)
        .visible(false)
        .build()?;
    if !hidden {
        window.show()?;
    }
    Ok(())
}

fn data_dir() -> PathBuf {
    if let Ok(value) = std::env::var("CHILL_DATA_DIR") {
        if !value.trim().is_empty() {
            return PathBuf::from(value);
        }
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        return PathBuf::from(appdata).join("Chill");
    }
    PathBuf::from("chill-data")
}

fn web_root(app: &AppHandle) -> anyhow::Result<PathBuf> {
    if let Ok(value) = std::env::var("CHILL_WEB_ROOT") {
        let path = PathBuf::from(value);
        if path.join("index.html").is_file() {
            return Ok(path);
        }
    }
    if cfg!(debug_assertions) {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets");
        if path.join("index.html").is_file() {
            return Ok(path);
        }
    }
    let path = app
        .path()
        .resource_dir()
        .context("Nie znaleziono katalogu zasobów Chill.")?
        .join("assets");
    if path.join("index.html").is_file() {
        return Ok(path);
    }
    Err(anyhow!(
        "Nie znaleziono interfejsu Chill w {}.",
        path.display()
    ))
}
