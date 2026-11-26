use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::OnceLock;
use std::time::UNIX_EPOCH;

use axum::body::Body;
use axum::http::header::{
    ACCEPT_ENCODING, CACHE_CONTROL, CONTENT_ENCODING, CONTENT_LENGTH, CONTENT_TYPE, ETAG,
    IF_NONE_MATCH, VARY,
};
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode};
use axum::response::Response;
use bytes::Bytes;
use sha1::{Digest, Sha1};

/// The only files the embedded server exposes. Keeping this list explicit means
/// no request can ever escape the web root or read arbitrary files.
const ASSETS: &[(&str, &str)] = &[
    ("index.html", "text/html; charset=utf-8"),
    ("terms.html", "text/html; charset=utf-8"),
    ("privacy.html", "text/html; charset=utf-8"),
    ("style.css", "text/css; charset=utf-8"),
    ("minigames.css", "text/css; charset=utf-8"),
    ("renderer.js", "text/javascript; charset=utf-8"),
    ("minigames.js", "text/javascript; charset=utf-8"),
    ("gifs.js", "text/javascript; charset=utf-8"),
    ("stickers.js", "text/javascript; charset=utf-8"),
    ("voice.js", "text/javascript; charset=utf-8"),
    ("attachments.js", "text/javascript; charset=utf-8"),
    ("appearance.js", "text/javascript; charset=utf-8"),
    ("chill-web.js", "text/javascript; charset=utf-8"),
    ("tauri-desktop.js", "text/javascript; charset=utf-8"),
    ("build/icon.png", "image/png"),
    ("build/icon.svg", "image/svg+xml"),
];

/// Number of bytes kept in RAM for the UI. The current UI is roughly 1 MB, so
/// caching it removes all disk I/O from page loads without meaningful memory cost.
pub struct StaticAsset {
    bytes: Bytes,
    content_type: &'static str,
    etag: String,
    compressible: bool,
    brotli: OnceLock<Bytes>,
}

impl StaticAsset {
    fn load(root: &Path, file: &str, content_type: &'static str) -> Option<Self> {
        let path = root.join(file);
        let data = fs::read(&path).ok()?;
        let mut hasher = Sha1::new();
        hasher.update(&data);
        let digest = hex::encode(hasher.finalize());
        let etag = format!("\"{}\"", &digest[..20]);
        let compressible = matches!(
            content_type,
            "text/html; charset=utf-8"
                | "text/css; charset=utf-8"
                | "text/javascript; charset=utf-8"
                | "image/svg+xml"
        );

        let brotli = OnceLock::new();
        if compressible {
            // A `.br` file generated at build/deploy time gives us maximum
            // compression without paying for it on the first request. Only use
            // it when it is at least as new as the source file.
            let compressed = root.join(format!("{file}.br"));
            if let (Ok(source), Ok(compressed_meta), Ok(payload)) = (
                fs::metadata(&path),
                fs::metadata(&compressed),
                fs::read(&compressed),
            ) {
                if modified_ms(&compressed_meta) >= modified_ms(&source) {
                    let _ = brotli.set(Bytes::from(payload));
                }
            }
        }

        Some(Self {
            bytes: Bytes::from(data),
            content_type,
            etag,
            compressible,
            brotli,
        })
    }

    fn encoded(&self) -> Option<(Bytes, String)> {
        if !self.compressible {
            return None;
        }
        let data = self
            .brotli
            .get_or_init(|| compress(&self.bytes))
            .clone();
        Some((data, format!("{}-br\"", &self.etag[..self.etag.len() - 1])))
    }

    fn body_bytes(&self) -> Bytes {
        self.bytes.clone()
    }
}

fn modified_ms(meta: &fs::Metadata) -> u128 {
    meta.modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn compress(data: &[u8]) -> Bytes {
    let mut params = brotli::enc::BrotliEncoderParams::default();
    params.quality = std::env::var("CHILL_BROTLI_QUALITY")
        .ok()
        .and_then(|value| value.parse::<i32>().ok())
        .unwrap_or(5)
        .clamp(1, 11);
    params.lgwin = 22;
    params.size_hint = data.len();
    let mut output = Vec::with_capacity(data.len() / 4);
    match brotli::BrotliCompress(&mut &data[..], &mut output, &params) {
        Ok(_) => Bytes::from(output),
        Err(_) => Bytes::copy_from_slice(data),
    }
}

pub struct Assets {
    entries: HashMap<&'static str, StaticAsset>,
}

impl Assets {
    pub fn load(root: &Path) -> Self {
        let mut entries = HashMap::with_capacity(ASSETS.len());
        for (file, content_type) in ASSETS {
            if let Some(asset) = StaticAsset::load(root, file, content_type) {
                entries.insert(*file, asset);
            }
        }
        Self { entries }
    }

    pub fn has(&self, file: &str) -> bool {
        self.entries.contains_key(file)
    }

    /// Pre-compress the text assets in the background so the first public page
    /// load already gets Brotli payloads. The desktop app talks to localhost,
    /// where compression would only waste CPU, so callers can skip this.
    pub fn warm(&self) {
        std::thread::scope(|scope| {
            for asset in self.entries.values() {
                if asset.compressible && asset.brotli.get().is_none() {
                    scope.spawn(move || {
                        let _ = asset.brotli.get_or_init(|| compress(&asset.bytes));
                    });
                }
            }
        });
    }

    pub fn response(
        &self,
        file: &str,
        headers: &HeaderMap,
        method: &Method,
        cache_control: &'static str,
    ) -> Response {
        let Some(asset) = self.entries.get(file) else {
            return not_found();
        };

        let compressed = if accepts_brotli(headers) {
            asset.encoded()
        } else {
            None
        };
        let encoded = compressed.is_some();
        let (body, etag) = match compressed {
            Some((data, etag)) => (data, etag),
            None => (asset.body_bytes(), asset.etag.clone()),
        };

        let mut response = Response::new(if *method == Method::HEAD {
            Body::empty()
        } else {
            Body::from(body.clone())
        });
        let output = response.headers_mut();
        output.insert(CONTENT_TYPE, HeaderValue::from_static(asset.content_type));
        output.insert(CACHE_CONTROL, HeaderValue::from_static(cache_control));
        output.insert(VARY, HeaderValue::from_static("accept-encoding"));
        if let Ok(value) = HeaderValue::from_str(&etag) {
            output.insert(ETAG, value);
        }
        if let Ok(value) = HeaderValue::from_str(&body.len().to_string()) {
            output.insert(CONTENT_LENGTH, value);
        }
        if encoded {
            output.insert(CONTENT_ENCODING, HeaderValue::from_static("br"));
        }

        if etag_matches(headers, &etag) {
            *response.status_mut() = StatusCode::NOT_MODIFIED;
            response.headers_mut().remove(CONTENT_LENGTH);
            *response.body_mut() = Body::empty();
        }

        response
    }
}

fn not_found() -> Response {
    let mut response = Response::new(Body::from("Not found"));
    *response.status_mut() = StatusCode::NOT_FOUND;
    response
        .headers_mut()
        .insert(CONTENT_TYPE, HeaderValue::from_static("text/plain; charset=utf-8"));
    response
        .headers_mut()
        .insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

fn accepts_brotli(headers: &HeaderMap) -> bool {
    let Some(value) = headers.get(ACCEPT_ENCODING).and_then(|value| value.to_str().ok()) else {
        return false;
    };
    value.split(',').any(|part| {
        let mut pieces = part.trim().split(';');
        let encoding = pieces.next().unwrap_or("").trim();
        if !encoding.eq_ignore_ascii_case("br") {
            return false;
        }
        let mut quality = 1.0f32;
        for parameter in pieces {
            if let Some(raw) = parameter.trim().strip_prefix("q=") {
                quality = raw.parse().unwrap_or(0.0);
            }
        }
        quality > 0.0
    })
}

fn etag_matches(headers: &HeaderMap, etag: &str) -> bool {
    let Some(value) = headers.get(IF_NONE_MATCH).and_then(|value| value.to_str().ok()) else {
        return false;
    };
    value.split(',').any(|part| {
        let candidate = part.trim();
        candidate == "*"
            || candidate == etag
            || candidate.strip_prefix("W/").map(|value| value == etag).unwrap_or(false)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn brotli_negotiation_respects_quality_zero() {
        let mut headers = HeaderMap::new();
        headers.insert(ACCEPT_ENCODING, HeaderValue::from_static("gzip, br"));
        assert!(accepts_brotli(&headers));
        headers.insert(ACCEPT_ENCODING, HeaderValue::from_static("br;q=0"));
        assert!(!accepts_brotli(&headers));
        headers.insert(ACCEPT_ENCODING, HeaderValue::from_static("gzip"));
        assert!(!accepts_brotli(&headers));
    }

    #[test]
    fn etag_matching_accepts_weak_and_wildcard() {
        let mut headers = HeaderMap::new();
        headers.insert(IF_NONE_MATCH, HeaderValue::from_static("\"abc\""));
        assert!(etag_matches(&headers, "\"abc\""));
        headers.insert(IF_NONE_MATCH, HeaderValue::from_static("W/\"abc\""));
        assert!(etag_matches(&headers, "\"abc\""));
        headers.insert(IF_NONE_MATCH, HeaderValue::from_static("*"));
        assert!(etag_matches(&headers, "\"abc\""));
        headers.insert(IF_NONE_MATCH, HeaderValue::from_static("\"other\""));
        assert!(!etag_matches(&headers, "\"abc\""));
    }

    #[test]
    fn cached_asset_serves_brotli_and_revalidates_with_etag() {
        let dir = std::env::temp_dir().join(format!("chill-assets-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(dir.join("build")).expect("temp dir");
        let css = "body { color: #3ee0a3; }\n".repeat(400);
        fs::write(dir.join("style.css"), &css).expect("style");
        fs::write(dir.join("build/icon.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>")
            .expect("icon");

        let assets = Assets::load(&dir);
        assert!(assets.has("style.css"));
        assert!(assets.has("build/icon.svg"));

        let mut headers = HeaderMap::new();
        headers.insert(ACCEPT_ENCODING, HeaderValue::from_static("gzip, br"));
        let response = assets.response(
            "style.css",
            &headers,
            &Method::GET,
            "public, max-age=0, must-revalidate",
        );
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(CONTENT_ENCODING).unwrap(),
            HeaderValue::from_static("br")
        );
        let transferred: usize = response
            .headers()
            .get(CONTENT_LENGTH)
            .unwrap()
            .to_str()
            .unwrap()
            .parse()
            .unwrap();
        assert!(transferred < css.len() / 2, "brotli payload should be much smaller");

        let etag = response
            .headers()
            .get(ETAG)
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();
        let mut conditional = HeaderMap::new();
        conditional.insert(ACCEPT_ENCODING, HeaderValue::from_static("br"));
        conditional.insert(IF_NONE_MATCH, HeaderValue::from_str(&etag).unwrap());
        let cached = assets.response(
            "style.css",
            &conditional,
            &Method::GET,
            "public, max-age=0, must-revalidate",
        );
        assert_eq!(cached.status(), StatusCode::NOT_MODIFIED);
        assert!(cached.headers().get(CONTENT_LENGTH).is_none());

        let missing = assets.response("missing.js", &headers, &Method::GET, "public");
        assert_eq!(missing.status(), StatusCode::NOT_FOUND);
        let _ = fs::remove_dir_all(&dir);
    }
}
