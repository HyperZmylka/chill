use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::ws::WebSocketUpgrade;
use axum::extract::{ConnectInfo, Query, State};
use axum::http::header::{
    CACHE_CONTROL, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, COOKIE, HOST, ORIGIN, RANGE,
    REFERRER_POLICY, SET_COOKIE, X_CONTENT_TYPE_OPTIONS,
};
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{json, Value};

use crate::bridge::{self, BridgeContext};
use crate::model::*;
use crate::state::*;

const MAX_BRIDGE_BODY: usize = 4 * 1024 * 1024;
const MAX_VOICE_BODY: usize = 4 * 1024 * 1024;
const MIN_VOICE_SECONDS: f64 = 0.5;
const MAX_VOICE_SECONDS: f64 = 120.0;

const PUBLIC_CHANNELS: &[&str] = &[
    "chill:auth-session",
    "chill:auth-register",
    "chill:auth-login",
    "chill:auth-logout",
    "chill:app-version",
    "chill:update-check",
];

const BRIDGE_CHANNELS: &[&str] = &[
    "chill:auth-session",
    "chill:auth-register",
    "chill:auth-login",
    "chill:auth-logout",
    "chill:auth-update-profile",
    "chill:auth-change-password",
    "chill:servers-list",
    "chill:servers-create",
    "chill:servers-save-joined",
    "chill:servers-leave",
    "chill:servers-invite",
    "chill:discord-config-get",
    "chill:discord-config-set",
    "chill:discord-connect",
    "chill:discord-disconnect",
    "chill:discord-cancel",
    "chill:discord-preview",
    "chill:discord-import",
    "chill:app-version",
    "chill:update-check",
];

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(index))
        .route("/api/bridge", post(bridge_endpoint))
        .route("/api/version", get(version))
        .route("/healthz", get(healthz))
        .route("/voice", post(voice_upload))
        .route(
            "/voice/{id}",
            get(voice_download).delete(voice_delete),
        )
        .route("/chat", get(ws_upgrade))
        .route("/{*path}", get(asset))
        .with_state(state)
}

fn security_headers(response: &mut Response) {
    let headers = response.headers_mut();
    headers.insert(X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    headers.insert(
        "x-frame-options",
        HeaderValue::from_static("DENY"),
    );
    headers.insert(REFERRER_POLICY, HeaderValue::from_static("no-referrer"));
    headers.insert(
        "permissions-policy",
        HeaderValue::from_static(
            "camera=(self), microphone=(self), display-capture=(self), geolocation=()",
        ),
    );
}

fn text_response(status: StatusCode, text: &str) -> Response {
    let mut response = Response::new(Body::from(text.to_string()));
    *response.status_mut() = status;
    response
        .headers_mut()
        .insert(CONTENT_TYPE, HeaderValue::from_static("text/plain; charset=utf-8"));
    response
        .headers_mut()
        .insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

fn json_response(status: StatusCode, value: &Value) -> Response {
    let mut response = Response::new(Body::from(value.to_string()));
    *response.status_mut() = status;
    response.headers_mut().insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/json; charset=utf-8"),
    );
    response
        .headers_mut()
        .insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
        .headers_mut()
        .insert(X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    response
}

fn cookie(headers: &HeaderMap, name: &str) -> String {
    let Some(raw) = headers.get(COOKIE).and_then(|value| value.to_str().ok()) else {
        return String::new();
    };
    for part in raw.split(';') {
        let Some(index) = part.find('=') else { continue };
        if part[..index].trim() == name {
            return part[index + 1..].trim().to_string();
        }
    }
    String::new()
}

fn is_loopback(address: &SocketAddr) -> bool {
    address.ip().is_loopback()
}

fn forwarded(headers: &HeaderMap) -> bool {
    headers.contains_key("cf-connecting-ip")
        || headers.contains_key("cf-ray")
        || headers.contains_key("x-forwarded-for")
}

fn web_request_allowed(state: &AppState, headers: &HeaderMap, address: &SocketAddr) -> bool {
    if state.cfg.public_web {
        return true;
    }
    is_loopback(address) && !forwarded(headers)
}

fn request_origin(state: &AppState, headers: &HeaderMap) -> String {
    if let Some(origin) = &state.cfg.public_origin {
        return origin.clone();
    }
    let protocol = headers
        .get("x-forwarded-proto")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(|value| value.trim().to_lowercase())
        .filter(|value| value == "https" || value == "http")
        .unwrap_or_else(|| "http".to_string());
    let host = headers
        .get("x-forwarded-host")
        .or_else(|| headers.get(HOST))
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(|value| value.trim())
        .unwrap_or("");
    if !host.is_empty() {
        if let Ok(url) = url::Url::parse(&format!("{}://{}", protocol, host)) {
            return url.origin().ascii_serialization();
        }
    }
    format!("http://127.0.0.1:{}", state.cfg.port)
}

fn request_secure(state: &AppState, headers: &HeaderMap) -> bool {
    if let Some(origin) = &state.cfg.public_origin {
        return origin.starts_with("https://");
    }
    headers
        .get("x-forwarded-proto")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(|value| value.trim() == "https")
        .unwrap_or(false)
}

fn same_origin(state: &AppState, headers: &HeaderMap) -> bool {
    let Some(origin) = headers.get(ORIGIN).and_then(|value| value.to_str().ok()) else {
        return true;
    };
    let Ok(parsed) = url::Url::parse(origin) else {
        return false;
    };
    parsed.origin().ascii_serialization() == request_origin(state, headers)
}

async fn index(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    method: Method,
) -> Response {
    if !web_request_allowed(&state, &headers, &address) {
        return text_response(
            StatusCode::FORBIDDEN,
            "Chill Web jest dostępny tylko na tym komputerze.",
        );
    }
    let path = state.cfg.web_root.join("index.html");
    let Ok(data) = tokio::fs::read(&path).await else {
        return text_response(StatusCode::NOT_FOUND, "Not found");
    };
    let mut response = Response::new(Body::from(data));
    let secure = request_secure(&state, &headers);
    {
        let output = response.headers_mut();
        output.insert(
            CONTENT_TYPE,
            HeaderValue::from_static("text/html; charset=utf-8"),
        );
        output.insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
        if cookie(&headers, "chill_csrf").is_empty() {
            let token = random_hex(24);
            let suffix = if secure { "; Secure" } else { "" };
            if let Ok(value) = HeaderValue::from_str(&format!(
                "chill_csrf={}; Path=/; SameSite=Lax{}",
                token, suffix
            )) {
                output.append(SET_COOKIE, value);
            }
        }
        if !state.cfg.public_web && cookie(&headers, "chill_web") != state.web_token {
            let suffix = if secure { "; Secure" } else { "" };
            if let Ok(value) = HeaderValue::from_str(&format!(
                "chill_web={}; Path=/; HttpOnly; SameSite=Strict{}",
                state.web_token, suffix
            )) {
                output.append(SET_COOKIE, value);
            }
        }
    }
    security_headers(&mut response);
    if method == Method::HEAD {
        *response.body_mut() = Body::empty();
    }
    response
}

async fn asset(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    axum::extract::Path(path): axum::extract::Path<String>,
    method: Method,
) -> Response {
    if !web_request_allowed(&state, &headers, &address) {
        return text_response(
            StatusCode::FORBIDDEN,
            "Chill Web jest dostępny tylko na tym komputerze.",
        );
    }
    let normalized = path.trim_start_matches('/');
    let (file, content_type) = match normalized {
        "index.html" => ("index.html", "text/html; charset=utf-8"),
        "style.css" => ("style.css", "text/css; charset=utf-8"),
        "minigames.css" => ("minigames.css", "text/css; charset=utf-8"),
        "renderer.js" => ("renderer.js", "text/javascript; charset=utf-8"),
        "minigames.js" => ("minigames.js", "text/javascript; charset=utf-8"),
        "gifs.js" => ("gifs.js", "text/javascript; charset=utf-8"),
        "stickers.js" => ("stickers.js", "text/javascript; charset=utf-8"),
        "voice.js" => ("voice.js", "text/javascript; charset=utf-8"),
        "appearance.js" => ("appearance.js", "text/javascript; charset=utf-8"),
        "chill-web.js" => ("chill-web.js", "text/javascript; charset=utf-8"),
        "tauri-desktop.js" => ("tauri-desktop.js", "text/javascript; charset=utf-8"),
        "build/icon.png" => ("build/icon.png", "image/png"),
        _ => return text_response(StatusCode::NOT_FOUND, "Not found"),
    };
    let Ok(data) = tokio::fs::read(state.cfg.web_root.join(file)).await else {
        return text_response(StatusCode::NOT_FOUND, "Not found");
    };
    let mut response = Response::new(Body::from(data));
    response
        .headers_mut()
        .insert(CONTENT_TYPE, HeaderValue::from_static(content_type));
    response
        .headers_mut()
        .insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    security_headers(&mut response);
    if method == Method::HEAD {
        *response.body_mut() = Body::empty();
    }
    response
}

async fn bridge_endpoint(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    body: axum::body::Bytes,
) -> Response {
    if !web_request_allowed(&state, &headers, &address) {
        return json_response(
            StatusCode::FORBIDDEN,
            &json!({ "ok": false, "error": "Ta funkcja jest dostępna tylko lokalnie." }),
        );
    }
    let content_type = headers
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_lowercase();
    if !content_type.starts_with("application/json") {
        return json_response(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            &json!({ "ok": false, "error": "Wymagany jest format JSON." }),
        );
    }
    if !same_origin(&state, &headers) {
        return json_response(
            StatusCode::FORBIDDEN,
            &json!({ "ok": false, "error": "Nieprawidłowe źródło żądania." }),
        );
    }
    let csrf_header = headers
        .get("x-chill-csrf")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .trim()
        .to_string();
    let csrf_cookie = cookie(&headers, "chill_csrf");
    if csrf_cookie.is_empty() || csrf_header.is_empty() || csrf_header != csrf_cookie {
        return json_response(
            StatusCode::FORBIDDEN,
            &json!({ "ok": false, "error": "Odśwież stronę Chill i spróbuj ponownie." }),
        );
    }
    if !state.cfg.public_web && cookie(&headers, "chill_web") != state.web_token {
        return json_response(
            StatusCode::FORBIDDEN,
            &json!({ "ok": false, "error": "Odśwież stronę Chill i spróbuj ponownie." }),
        );
    }
    if body.len() > MAX_BRIDGE_BODY {
        return json_response(
            StatusCode::BAD_REQUEST,
            &json!({ "ok": false, "error": "Nieprawidłowe dane." }),
        );
    }
    let parsed: Value = match serde_json::from_slice(&body) {
        Ok(value) => value,
        Err(_) => {
            return json_response(
                StatusCode::BAD_REQUEST,
                &json!({ "ok": false, "error": "Nieprawidłowe dane." }),
            )
        }
    };
    let channel = parsed
        .get("channel")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    if !BRIDGE_CHANNELS.contains(&channel.as_str()) {
        return json_response(
            StatusCode::NOT_FOUND,
            &json!({ "ok": false, "error": "Nieznana operacja." }),
        );
    }
    let payload = parsed
        .get("payload")
        .filter(|value| value.is_object())
        .cloned()
        .unwrap_or_else(|| json!({}));

    let token = if state.cfg.public_web {
        cookie(&headers, "chill_sid")
    } else {
        String::new()
    };
    let user = if state.cfg.public_web {
        state.web_user_for_token(&token)
    } else {
        state.active_session_user()
    };
    if state.cfg.public_web
        && user.is_none()
        && !PUBLIC_CHANNELS.contains(&channel.as_str())
    {
        return json_response(
            StatusCode::UNAUTHORIZED,
            &json!({ "ok": false, "error": "Sesja wygasła. Zaloguj się ponownie." }),
        );
    }

    let mut context = BridgeContext {
        public: state.cfg.public_web,
        origin: request_origin(&state, &headers),
        secure: request_secure(&state, &headers),
        token,
        user,
    };
    let reply = bridge::dispatch(&state, &mut context, &channel, &payload);
    let body = match reply.result {
        Ok(result) => json!({ "ok": true, "result": result }),
        Err(error) => json!({ "ok": true, "result": { "ok": false, "error": error } }),
    };
    let mut response = json_response(StatusCode::OK, &body);
    for value in reply.cookies {
        if let Ok(header) = HeaderValue::from_str(&value) {
            response.headers_mut().append(SET_COOKIE, header);
        }
    }
    response
}

async fn version(State(state): State<Arc<AppState>>) -> Json<Value> {
    Json(json!({
        "ok": true,
        "app": "chill",
        "version": state.cfg.version,
        "build": state.cfg.build,
        "public": state.cfg.public_web,
    }))
}

async fn healthz() -> Json<Value> {
    Json(json!({ "ok": true }))
}

async fn ws_upgrade(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    upgrade: WebSocketUpgrade,
) -> Response {
    if state.cfg.public_web && !same_origin(&state, &headers) {
        return text_response(StatusCode::FORBIDDEN, "Forbidden");
    }
    let token = cookie(&headers, "chill_sid");
    let web_user_id = if state.cfg.public_web {
        state.web_user_for_token(&token).map(|user| user.id)
    } else {
        None
    };
    upgrade.on_upgrade(move |socket| {
        crate::ws::handle(
            socket,
            state,
            headers,
            address,
            token,
            web_user_id,
        )
    })
}

fn normalize_mime(value: &str) -> String {
    let base = value
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_lowercase();
    match base.as_str() {
        "audio/webm" => "audio/webm",
        "audio/ogg" => "audio/ogg",
        "audio/mp4" => "audio/mp4",
        "audio/mpeg" => "audio/mpeg",
        "audio/wav" => "audio/wav",
        "audio/x-wav" => "audio/x-wav",
        _ => "",
    }
    .to_string()
}

fn extension_for_mime(mime: &str) -> &'static str {
    match mime {
        "audio/webm" => "webm",
        "audio/ogg" => "ogg",
        "audio/mp4" => "m4a",
        "audio/mpeg" => "mp3",
        "audio/wav" | "audio/x-wav" => "wav",
        _ => "",
    }
}

fn clamp_seconds(value: f64) -> f64 {
    if !value.is_finite() || value <= 0.0 {
        return 0.0;
    }
    (value * 10.0).round().min(MAX_VOICE_SECONDS * 10.0) / 10.0
}

fn looks_like_voice(data: &[u8], mime: &str) -> bool {
    if data.len() < 12 {
        return false;
    }
    match mime {
        "audio/webm" => data[0..4] == [0x1a, 0x45, 0xdf, 0xa3],
        "audio/ogg" => &data[0..4] == b"OggS",
        "audio/mp4" => &data[4..8] == b"ftyp",
        "audio/wav" | "audio/x-wav" => &data[0..4] == b"RIFF" && &data[8..12] == b"WAVE",
        "audio/mpeg" => &data[0..3] == b"ID3" || (data[0] == 0xff && (data[1] & 0xe0) == 0xe0),
        _ => false,
    }
}

fn parse_byte_range(value: &str, size: u64) -> Option<(u64, u64)> {
    let raw = value.trim().strip_prefix("bytes=")?;
    let (start_raw, end_raw) = raw.split_once('-')?;
    if start_raw.is_empty() && end_raw.is_empty() {
        return None;
    }
    if start_raw.is_empty() {
        let suffix: u64 = end_raw.parse().ok()?;
        if suffix == 0 {
            return None;
        }
        let start = size.saturating_sub(suffix);
        return Some((start, size.saturating_sub(1)));
    }
    let start: u64 = start_raw.parse().ok()?;
    let end: u64 = if end_raw.is_empty() {
        size.saturating_sub(1)
    } else {
        end_raw.parse::<u64>().ok()?.min(size.saturating_sub(1))
    };
    if start >= size || end < start {
        return None;
    }
    Some((start, end))
}

async fn voice_upload(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> Response {
    let token = query.get("key").cloned().unwrap_or_default();
    let Some(auth) = state.active_voice_token(&token) else {
        return json_response(
            StatusCode::UNAUTHORIZED,
            &json!({ "ok": false, "error": "unauthorized" }),
        );
    };
    let mime = normalize_mime(
        headers
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or(""),
    );
    if mime.is_empty() {
        return json_response(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            &json!({ "ok": false, "error": "unsupported-type" }),
        );
    }
    if let Some(length) = headers
        .get(CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<usize>().ok())
    {
        if length > MAX_VOICE_BODY {
            return json_response(
                StatusCode::PAYLOAD_TOO_LARGE,
                &json!({ "ok": false, "error": "too-large" }),
            );
        }
    }
    if body.len() > MAX_VOICE_BODY {
        return json_response(
            StatusCode::PAYLOAD_TOO_LARGE,
            &json!({ "ok": false, "error": "too-large" }),
        );
    }
    if !looks_like_voice(&body, &mime) {
        return json_response(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            &json!({ "ok": false, "error": "unsupported-type" }),
        );
    }
    let duration = clamp_seconds(
        query
            .get("d")
            .and_then(|value| value.parse::<f64>().ok())
            .unwrap_or(0.0),
    );
    if duration < MIN_VOICE_SECONDS {
        return json_response(
            StatusCode::BAD_REQUEST,
            &json!({ "ok": false, "error": "invalid-duration" }),
        );
    }
    let id = random_hex(16);
    let ext = extension_for_mime(&mime);
    let file = format!("{}.{}", id, ext);
    let voice_dir = state.voice_dir();
    if tokio::fs::create_dir_all(&voice_dir).await.is_err() {
        return json_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            &json!({ "ok": false, "error": "save-failed" }),
        );
    }
    if tokio::fs::write(voice_dir.join(&file), &body).await.is_err() {
        return json_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            &json!({ "ok": false, "error": "save-failed" }),
        );
    }
    {
        let mut store = state.voice.write();
        store.items.insert(
            id.clone(),
            VoiceItem {
                id: id.clone(),
                scope: auth.scope,
                owner_id: auth.member_id,
                mime,
                ext: ext.to_string(),
                file,
                size: body.len() as u64,
                duration,
                at: now_ms(),
            },
        );
    }
    state.save_voice();
    json_response(
        StatusCode::OK,
        &json!({ "ok": true, "id": id, "duration": duration }),
    )
}

async fn voice_download(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    axum::extract::Path(id): axum::extract::Path<String>,
    Query(query): Query<HashMap<String, String>>,
    method: Method,
) -> Response {
    if id.len() != 32 || !id.chars().all(|c| c.is_ascii_hexdigit()) {
        return json_response(
            StatusCode::NOT_FOUND,
            &json!({ "ok": false, "error": "not-found" }),
        );
    }
    let token = query.get("key").cloned().unwrap_or_default();
    let Some(auth) = state.active_voice_token(&token) else {
        return json_response(
            StatusCode::UNAUTHORIZED,
            &json!({ "ok": false, "error": "unauthorized" }),
        );
    };
    let item = state.voice.read().items.get(&id).cloned();
    let Some(item) = item else {
        return json_response(
            StatusCode::NOT_FOUND,
            &json!({ "ok": false, "error": "not-found" }),
        );
    };
    if item.scope != auth.scope {
        return json_response(
            StatusCode::NOT_FOUND,
            &json!({ "ok": false, "error": "not-found" }),
        );
    }
    let path = state.voice_dir().join(&item.file);
    let Ok(data) = tokio::fs::read(&path).await else {
        return json_response(
            StatusCode::NOT_FOUND,
            &json!({ "ok": false, "error": "not-found" }),
        );
    };
    let size = data.len() as u64;
    let mut response;
    if method == Method::HEAD {
        response = Response::new(Body::empty());
        response
            .headers_mut()
            .insert(CONTENT_LENGTH, HeaderValue::from_str(&size.to_string()).unwrap());
    } else if let Some((start, end)) = headers
        .get(RANGE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| parse_byte_range(value, size))
    {
        let slice = data[start as usize..=(end as usize)].to_vec();
        response = Response::new(Body::from(slice));
        *response.status_mut() = StatusCode::PARTIAL_CONTENT;
        response.headers_mut().insert(
            CONTENT_LENGTH,
            HeaderValue::from_str(&(end - start + 1).to_string()).unwrap(),
        );
        response.headers_mut().insert(
            CONTENT_RANGE,
            HeaderValue::from_str(&format!("bytes {}-{}/{}", start, end, size)).unwrap(),
        );
    } else {
        response = Response::new(Body::from(data));
        response
            .headers_mut()
            .insert(CONTENT_LENGTH, HeaderValue::from_str(&size.to_string()).unwrap());
    }
    response.headers_mut().insert(
        CONTENT_TYPE,
        HeaderValue::from_str(&item.mime).unwrap_or(HeaderValue::from_static("application/octet-stream")),
    );
    response.headers_mut().insert(
        CACHE_CONTROL,
        HeaderValue::from_static("private, max-age=86400"),
    );
    response
        .headers_mut()
        .insert("accept-ranges", HeaderValue::from_static("bytes"));
    response
}

async fn voice_delete(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(id): axum::extract::Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> Response {
    if id.len() != 32 || !id.chars().all(|c| c.is_ascii_hexdigit()) {
        return json_response(
            StatusCode::NOT_FOUND,
            &json!({ "ok": false, "error": "not-found" }),
        );
    }
    let token = query.get("key").cloned().unwrap_or_default();
    let Some(auth) = state.active_voice_token(&token) else {
        return json_response(
            StatusCode::UNAUTHORIZED,
            &json!({ "ok": false, "error": "unauthorized" }),
        );
    };
    let item = state.voice.read().items.get(&id).cloned();
    let Some(item) = item else {
        return json_response(
            StatusCode::NOT_FOUND,
            &json!({ "ok": false, "error": "not-found" }),
        );
    };
    if item.scope != auth.scope {
        return json_response(
            StatusCode::NOT_FOUND,
            &json!({ "ok": false, "error": "not-found" }),
        );
    }
    if item.owner_id != auth.member_id {
        return json_response(
            StatusCode::FORBIDDEN,
            &json!({ "ok": false, "error": "forbidden" }),
        );
    }
    state.remove_voice_item(&id, false);
    json_response(StatusCode::OK, &json!({ "ok": true }))
}
