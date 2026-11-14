use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use sha1::{Digest, Sha1};

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub host: String,
    pub public_web: bool,
    pub public_origin: Option<String>,
    pub data_dir: PathBuf,
    pub web_root: PathBuf,
    pub build: String,
    pub version: String,
}

impl Config {
    pub fn from_env() -> Self {
        let port = env::var("PORT")
            .ok()
            .or_else(|| env::var("CHILL_PORT").ok())
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(47830);
        let host = env::var("CHILL_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
        let public_web = env::var("CHILL_PUBLIC_WEB").map(|v| v == "1").unwrap_or(false)
            || env::args().any(|arg| arg == "--public-web");
        let public_origin = env::var("CHILL_PUBLIC_URL")
            .ok()
            .and_then(|raw| parse_origin(&raw));

        let data_dir = env::var("CHILL_DATA_DIR")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .map(|value| PathBuf::from(value))
            .unwrap_or_else(default_data_dir);

        let web_root = web_root();
        let version = env!("CARGO_PKG_VERSION").to_string();
        let build = env::var("CHILL_BUILD_ID")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| compute_build(&web_root));

        Self {
            port,
            host,
            public_web,
            public_origin,
            data_dir,
            web_root,
            build,
            version,
        }
    }

    pub fn desktop(data_dir: PathBuf, web_root: PathBuf) -> Self {
        Self {
            port: 0,
            host: "127.0.0.1".to_string(),
            public_web: false,
            public_origin: None,
            data_dir,
            web_root,
            build: env!("CARGO_PKG_VERSION").to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }

    pub fn origin(&self) -> String {
        if let Some(origin) = &self.public_origin {
            return origin.clone();
        }
        format!("http://127.0.0.1:{}", self.port)
    }
}

fn default_data_dir() -> PathBuf {
    if let Ok(appdata) = env::var("APPDATA") {
        return PathBuf::from(appdata).join("Chill");
    }
    if let Ok(home) = env::var("HOME") {
        return PathBuf::from(home).join(".chill");
    }
    PathBuf::from("chill-data")
}

fn parse_origin(raw: &str) -> Option<String> {
    let url = url::Url::parse(raw.trim()).ok()?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return None;
    }
    Some(url.origin().ascii_serialization())
}

pub fn web_root() -> PathBuf {
    if let Ok(value) = env::var("CHILL_WEB_ROOT") {
        let path = PathBuf::from(value);
        if path.join("index.html").is_file() {
            return path;
        }
    }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidate = manifest.join("..").join("..");
    if candidate.join("index.html").is_file() {
        return candidate;
    }
    if let Ok(exe) = env::current_exe() {
        if let Some(dir) = exe.parent() {
            if dir.join("index.html").is_file() {
                return dir.to_path_buf();
            }
        }
    }
    manifest
}

fn compute_build(root: &Path) -> String {
    let files = [
        "package.json",
        "index.html",
        "style.css",
        "minigames.css",
        "renderer.js",
        "minigames.js",
        "gifs.js",
        "stickers.js",
        "voice.js",
        "attachments.js",
        "appearance.js",
        "chill-web.js",
        "tauri-desktop.js",
        "main.js",
    ];
    let mut hash = Sha1::new();
    for file in files {
        match fs::metadata(root.join(file)) {
            Ok(meta) => {
                let mtime = meta
                    .modified()
                    .ok()
                    .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                    .map(|duration| duration.as_millis())
                    .unwrap_or(0);
                hash.update(format!("{}:{}:{};", file, meta.len(), mtime));
            }
            Err(_) => hash.update(format!("{}:missing;", file)),
        }
    }
    let digest = hash.finalize();
    hex::encode(digest)[..16].to_string()
}
