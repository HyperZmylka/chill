use std::sync::Mutex;

use once_cell::sync::Lazy;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, WebviewWindow};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_notification::NotificationExt;

use crate::VERSION;

#[derive(Clone, Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub url: String,
    pub notes: String,
}

static UPDATE_INFO: Lazy<Mutex<Option<UpdateInfo>>> = Lazy::new(|| Mutex::new(None));
static PENDING_INVITE: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));

#[tauri::command]
pub fn chill_version() -> String {
    VERSION.to_string()
}

pub fn set_pending_invite(url: &str) {
    if let Ok(mut pending) = PENDING_INVITE.lock() {
        *pending = Some(url.to_string());
    }
}

#[tauri::command]
pub fn chill_take_pending_invite() -> Option<String> {
    PENDING_INVITE.lock().ok().and_then(|mut pending| pending.take())
}

#[tauri::command]
pub fn chill_autostart_get(app: AppHandle) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn chill_autostart_set(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|error| error.to_string())?;
    } else {
        manager.disable().map_err(|error| error.to_string())?;
    }
    manager.is_enabled().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn chill_open_external(url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|_| "Nieprawidłowy adres.".to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Dozwolone są tylko adresy http i https.".to_string());
    }
    std::thread::spawn(move || {
        let _ = open::that(url);
    });
    Ok(())
}

#[tauri::command]
pub fn chill_screen_sources(window: WebviewWindow) -> Result<Vec<Value>, String> {
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    let mut sources = Vec::new();
    for (index, monitor) in monitors.iter().enumerate() {
        let size = monitor.size();
        let name = monitor
            .name()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| format!("Ekran {}", index + 1));
        sources.push(json!({
            "id": format!("screen:{}", index),
            "name": format!("{} ({}×{})", name, size.width, size.height),
            "kind": "screen",
            "thumb": Value::Null,
            "icon": Value::Null,
        }));
    }
    if sources.is_empty() {
        sources.push(json!({
            "id": "screen:0",
            "name": "Ekran",
            "kind": "screen",
            "thumb": Value::Null,
            "icon": Value::Null,
        }));
    }
    Ok(sources)
}

#[tauri::command]
pub fn chill_notify(app: AppHandle, title: String, body: String) -> Result<(), String> {
    let title = if title.trim().is_empty() {
        "Chill".to_string()
    } else {
        title.chars().take(120).collect::<String>()
    };
    let body = body.chars().take(500).collect::<String>();
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn chill_set_badge(window: WebviewWindow, count: u32) {
    let title = if count > 0 {
        format!("({}) Chill", count.min(999))
    } else {
        "Chill".to_string()
    };
    let _ = window.set_title(&title);
}

#[tauri::command]
pub fn chill_activity_ask(app: AppHandle) {
    if let Some(activity) = crate::games::current() {
        let _ = app.emit("chill://activity", activity);
    }
}

#[tauri::command]
pub async fn chill_update_check(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let client = reqwest::Client::builder()
        .user_agent(format!("Chill/{}", VERSION))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get("https://api.github.com/repos/HyperZmylka/chill/releases/latest")
        .header("accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("GitHub API: {}", response.status()));
    }
    let data: Value = response.json().await.map_err(|error| error.to_string())?;
    let tag = data
        .get("tag_name")
        .and_then(Value::as_str)
        .or_else(|| data.get("name").and_then(Value::as_str))
        .unwrap_or("0.0.0")
        .trim_start_matches('v')
        .to_string();
    if compare_versions(&tag, VERSION) <= 0 {
        *UPDATE_INFO.lock().unwrap() = None;
        return Ok(None);
    }

    let mut download = data
        .get("html_url")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    if let Some(assets) = data.get("assets").and_then(Value::as_array) {
        if let Some(url) = update_asset_url(assets) {
            download = url;
        }
    }

    let info = UpdateInfo {
        version: tag,
        url: download,
        notes: data
            .get("body")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
    };
    *UPDATE_INFO.lock().unwrap() = Some(info.clone());
    let _ = app.emit("chill://update-ready", info.clone());
    Ok(Some(info))
}

#[tauri::command]
pub async fn chill_update_install(app: AppHandle) -> Result<bool, String> {
    let info = UPDATE_INFO.lock().unwrap().clone();
    let Some(info) = info else {
        return Ok(false);
    };
    let parsed = url::Url::parse(&info.url).map_err(|_| "Nieprawidłowy adres aktualizacji.".to_string())?;
    if parsed.scheme() != "https" {
        return Err("Aktualizacja musi używać HTTPS.".to_string());
    }
    let host = parsed.host_str().unwrap_or("");
    if !(host == "github.com"
        || host.ends_with(".github.com")
        || host.ends_with(".githubusercontent.com"))
    {
        return Err("Niezaufany adres aktualizacji.".to_string());
    }
    if !info.url.to_lowercase().contains(".exe") {
        let _ = open::that(&info.url);
        return Ok(false);
    }

    let safe_version: String = info
        .version
        .chars()
        .filter(|value| value.is_ascii_alphanumeric() || *value == '.' || *value == '-')
        .collect();
    let file = std::env::temp_dir().join(format!("Chill-{}-Setup.exe", safe_version));
    if !file.is_file() {
        let client = reqwest::Client::builder()
            .user_agent(format!("Chill/{}", VERSION))
            .build()
            .map_err(|error| error.to_string())?;
        let response = client
            .get(&info.url)
            .send()
            .await
            .map_err(|error| error.to_string())?;
        if !response.status().is_success() {
            return Err(format!("Pobieranie aktualizacji: {}", response.status()));
        }
        let total = response.content_length().unwrap_or(0);
        let mut stream = response.bytes_stream();
        let mut output = tokio::fs::File::create(&file)
            .await
            .map_err(|error| error.to_string())?;
        let mut received = 0u64;
        let mut last = 101u64;
        use futures_util::StreamExt;
        use tokio::io::AsyncWriteExt;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|error| error.to_string())?;
            output
                .write_all(&chunk)
                .await
                .map_err(|error| error.to_string())?;
            received += chunk.len() as u64;
            if total > 0 {
                let percent = (received.saturating_mul(100) / total).min(100);
                if percent != last {
                    last = percent;
                    let _ = app.emit("chill://update-progress", percent);
                }
            }
        }
        output.flush().await.map_err(|error| error.to_string())?;
    }

    let _ = app.emit("chill://update-progress", 100u64);
    open::that(&file).map_err(|error| error.to_string())?;
    tokio::time::sleep(std::time::Duration::from_millis(900)).await;
    crate::QUITTING.store(true, std::sync::atomic::Ordering::SeqCst);
    app.exit(0);
    Ok(true)
}

fn update_asset_url(assets: &[Value]) -> Option<String> {
    fn name(asset: &Value) -> String {
        asset
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_lowercase()
    }
    fn url(asset: &Value) -> Option<String> {
        asset
            .get("browser_download_url")
            .and_then(Value::as_str)
            .map(str::to_string)
    }

    // Chill jest publikowany wyłącznie jako aplikacja Tauri.
    assets.iter().find_map(|asset| {
        let name = name(asset);
        if name.ends_with(".exe") && (name.contains("tauri") || name.contains("_x64-setup")) {
            url(asset)
        } else {
            None
        }
    })
}

fn compare_versions(left: &str, right: &str) -> i32 {
    let left = version_parts(left);
    let right = version_parts(right);
    let length = left.len().max(right.len());
    for index in 0..length {
        let a = left.get(index).copied().unwrap_or(0);
        let b = right.get(index).copied().unwrap_or(0);
        if a != b {
            return if a > b { 1 } else { -1 };
        }
    }
    0
}

fn version_parts(value: &str) -> Vec<u64> {
    value
        .trim()
        .trim_start_matches('v')
        .split('.')
        .map(|part| {
            part.chars()
                .take_while(|character| character.is_ascii_digit())
                .collect::<String>()
                .parse()
                .unwrap_or(0)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::update_asset_url;
    use serde_json::json;

    #[test]
    fn prefers_tauri_installer_when_release_has_both() {
        let assets = vec![
            json!({
                "name": "Chill-Setup-4.15.1.exe",
                "browser_download_url": "https://example.com/electron.exe"
            }),
            json!({
                "name": "Chill-Tauri-Setup-4.15.1.exe",
                "browser_download_url": "https://example.com/tauri.exe"
            }),
        ];
        assert_eq!(
            update_asset_url(&assets).as_deref(),
            Some("https://example.com/tauri.exe")
        );
    }

    #[test]
    fn accepts_raw_tauri_installer_name() {
        let assets = vec![
            json!({
                "name": "Chill-Setup-4.15.1.exe",
                "browser_download_url": "https://example.com/electron.exe"
            }),
            json!({
                "name": "Chill_4.15.1_x64-setup.exe",
                "browser_download_url": "https://example.com/tauri-raw.exe"
            }),
        ];
        assert_eq!(
            update_asset_url(&assets).as_deref(),
            Some("https://example.com/tauri-raw.exe")
        );
    }

    #[test]
    fn ignores_electron_only_release() {
        let assets = vec![
            json!({
                "name": "latest.yml",
                "browser_download_url": "https://example.com/latest.yml"
            }),
            json!({
                "name": "Chill-Setup-4.15.1.exe",
                "browser_download_url": "https://example.com/electron.exe"
            }),
        ];
        assert_eq!(update_asset_url(&assets), None);
    }

    #[test]
    fn ignores_non_exe_assets() {
        let assets = vec![json!({
            "name": "notes.txt",
            "browser_download_url": "https://example.com/notes"
        })];
        assert_eq!(update_asset_url(&assets), None);
    }
}
