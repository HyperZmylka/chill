use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH};

use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

pub const SERVER_TRAIT_LIMIT: usize = 5;
pub const SERVER_TRAIT_LENGTH: usize = 24;
pub const SERVER_GAME_LIMIT: usize = 5;
pub const SERVER_GAME_LENGTH: usize = 24;
pub const SERVER_DESCRIPTION_LENGTH: usize = 280;
pub const PROFILE_AVATAR_MAX: usize = 260_000;
pub const PROFILE_BANNER_MAX: usize = 720_000;
pub const GAME_ICON_MAX: usize = 120_000;

static CONTROL_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"[\u{0000}-\u{001f}\u{007f}]").unwrap());
static DESCRIPTION_CONTROL_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"[\u{0000}-\u{0008}\u{000b}\u{000c}\u{000e}-\u{001f}\u{007f}]").unwrap());
static SPACE_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s+").unwrap());
static PROFILE_IMAGE_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)^data:image/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$").unwrap());
static GAME_ICON_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)^data:image/png;base64,[a-z0-9+/=]+$").unwrap());
static HANDLE_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[a-z0-9_.]{3,32}$").unwrap());
static HEX_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)^#[0-9a-f]{6}$").unwrap());
static CHANNEL_CLEAN_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"[^\p{L}\p{N}_.-]").unwrap());
static VOICE_ID_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^chill-voice://([a-f0-9]{32})(?:\?d=\d{1,3}(?:\.\d{1,2})?)?$").unwrap());
static INVITE_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[A-Z0-9]{4,12}$").unwrap());
static EMAIL_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$").unwrap());
static USERNAME_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[a-zA-Z0-9_.]{3,20}$").unwrap());

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

pub fn take_chars(value: &str, limit: usize) -> String {
    value.chars().take(limit).collect()
}

pub fn js_trim(value: &str) -> String {
    value.trim_matches(|c: char| c.is_whitespace()).to_string()
}

pub fn is_valid_hex(value: &str) -> bool {
    HEX_RE.is_match(value)
}

pub fn safe_hex(value: &Value, fallback: &str) -> String {
    let text = value_to_string(value);
    if HEX_RE.is_match(&text) {
        text.to_lowercase()
    } else {
        fallback.to_string()
    }
}

pub fn value_to_string(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::Bool(value) => value.to_string(),
        Value::Number(value) => value.to_string(),
        Value::String(value) => value.clone(),
        _ => String::new(),
    }
}

pub fn sanitize_handle(value: &str) -> String {
    let text = value.trim().to_lowercase();
    if HANDLE_RE.is_match(&text) {
        text
    } else {
        String::new()
    }
}

pub fn handle_for_account(id: &str, username: &str, stored: &str) -> String {
    let value = stored.trim().to_lowercase();
    if HANDLE_RE.is_match(&value) {
        return value;
    }
    let base: String = username
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == '_' || *c == '.')
        .take(20)
        .collect();
    let base = if base.is_empty() { "osoba".to_string() } else { base };
    let digits: String = id.chars().filter(|c| c.is_ascii_digit()).collect();
    let suffix: String = if digits.len() >= 5 {
        digits[digits.len() - 5..].to_string()
    } else {
        let now = now_ms().to_string();
        let tail = if now.len() >= 5 { &now[now.len() - 5..] } else { &now };
        format!("{:0>5}", tail)
    };
    take_chars(&format!("{}_{}", base, suffix), 32)
}

fn safe_profile_image(value: &str, max_length: usize) -> String {
    if value.is_empty() || value.chars().count() > max_length || !PROFILE_IMAGE_RE.is_match(value) {
        return String::new();
    }
    value.to_string()
}

fn safe_profile_emoji(value: &str) -> String {
    let text = value.trim();
    if text.is_empty()
        || text.chars().count() > 24
        || text
            .chars()
            .any(|c| (c as u32) < 0x20 || matches!(c, '<' | '>' | '"' | '\'' | '&'))
    {
        return String::new();
    }
    text.to_string()
}

pub fn sanitize_avatar(value: &str) -> String {
    if value.is_empty() {
        return String::new();
    }
    let image = safe_profile_image(value, PROFILE_AVATAR_MAX);
    if !image.is_empty() {
        return image;
    }
    safe_profile_emoji(value)
}

pub fn sanitize_game_icon(value: &str) -> String {
    if value.is_empty() || value.chars().count() > GAME_ICON_MAX || !GAME_ICON_RE.is_match(value) {
        return String::new();
    }
    value.to_string()
}

pub fn sanitize_game_platform(value: &str) -> String {
    const ALLOWED: &[&str] = &[
        "medal", "steam", "roblox", "epic", "gog", "xbox", "ea", "ubisoft", "battlenet", "riot",
        "minecraft", "itch", "other",
    ];
    let platform = value.to_lowercase();
    if ALLOWED.contains(&platform.as_str()) {
        platform
    } else {
        "other".to_string()
    }
}

pub fn default_banner() -> Value {
    json!({ "kind": "preset", "preset": "black" })
}

pub fn sanitize_banner(value: &Value) -> Value {
    let Some(object) = value.as_object() else {
        return default_banner();
    };
    match object.get("kind").and_then(Value::as_str).unwrap_or("") {
        "preset" => {
            let preset = object
                .get("preset")
                .map(value_to_string)
                .unwrap_or_default()
                .trim()
                .to_lowercase();
            let allowed = ["black", "mint", "ocean", "sunset", "forest", "neon"];
            if allowed.contains(&preset.as_str()) {
                json!({ "kind": "preset", "preset": preset })
            } else {
                default_banner()
            }
        }
        "image" => {
            let image = object.get("image").map(value_to_string).unwrap_or_default();
            let image = safe_profile_image(&image, PROFILE_BANNER_MAX);
            if image.is_empty() {
                default_banner()
            } else {
                json!({ "kind": "image", "image": image })
            }
        }
        "custom" => {
            let colors = object
                .get("colors")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let first = colors.first().map(|v| safe_hex(v, "#07110d")).unwrap_or_else(|| "#07110d".to_string());
            let second = colors.get(1).map(|v| safe_hex(v, "#3ee0a3")).unwrap_or_else(|| "#3ee0a3".to_string());
            let pattern = object
                .get("pattern")
                .map(value_to_string)
                .unwrap_or_else(|| "none".to_string())
                .to_lowercase();
            let allowed = ["none", "dots", "grid", "waves", "stars", "diagonal"];
            let pattern = if allowed.contains(&pattern.as_str()) {
                pattern
            } else {
                "none".to_string()
            };
            let emoji = object
                .get("emoji")
                .map(value_to_string)
                .map(|value| safe_profile_emoji(&value))
                .unwrap_or_default();
            json!({
                "kind": "custom",
                "colors": [first, second],
                "pattern": pattern,
                "emoji": emoji,
            })
        }
        _ => default_banner(),
    }
}

pub fn sanitize_badges(value: &Value, fallback: &[&str]) -> Vec<String> {
    let allowed = ["piwo", "chill", "og", "vip", "dev"];
    let Some(items) = value.as_array() else {
        return fallback.iter().map(|value| value.to_string()).collect();
    };
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    for item in items {
        let text = value_to_string(item).trim().to_lowercase();
        if !allowed.contains(&text.as_str()) || !seen.insert(text.clone()) {
            continue;
        }
        result.push(text);
        if result.len() >= 5 {
            break;
        }
    }
    result
}

pub fn sanitize_games(value: &Value) -> Vec<Game> {
    let Some(items) = value.as_array() else {
        return Vec::new();
    };
    let allowed = [
        "medal", "steam", "roblox", "epic", "gog", "xbox", "ea", "ubisoft", "battlenet", "riot",
        "minecraft", "itch", "other",
    ];
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    for item in items {
        let Some(object) = item.as_object() else { continue };
        let title = object.get("title").map(value_to_string).unwrap_or_default();
        let title = take_chars(&SPACE_RE.replace_all(title.trim(), " "), 40);
        if title.is_empty() {
            continue;
        }
        let key = title.to_lowercase();
        if !seen.insert(key) {
            continue;
        }
        let platform = object
            .get("platform")
            .map(value_to_string)
            .unwrap_or_else(|| "medal".to_string())
            .to_lowercase();
        let platform = if allowed.contains(&platform.as_str()) {
            platform
        } else {
            "other".to_string()
        };
        let color = object
            .get("color")
            .map(|value| safe_hex(value, ""))
            .unwrap_or_default();
        result.push(Game {
            title,
            platform,
            color,
        });
        if result.len() >= 12 {
            break;
        }
    }
    result
}

pub fn sanitize_server_banner(value: &Value) -> String {
    const ALLOWED: &[&str] = &[
        "graphite", "rose", "crimson", "ember", "gold", "violet", "azure", "aqua", "lime", "slate",
    ];
    let id = value_to_string(value).trim().to_lowercase();
    if ALLOWED.contains(&id.as_str()) {
        id
    } else {
        "graphite".to_string()
    }
}

pub fn sanitize_server_text_list(value: &Value, limit: usize, max_length: usize) -> Vec<String> {
    let Some(items) = value.as_array() else {
        return Vec::new();
    };
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    for item in items {
        let raw = value_to_string(item);
        let cleaned = CONTROL_RE.replace_all(&raw, " ");
        let cleaned = SPACE_RE.replace_all(&cleaned, " ");
        let text = take_chars(cleaned.trim(), max_length);
        if text.is_empty() {
            continue;
        }
        let key = text.to_lowercase();
        if !seen.insert(key) {
            continue;
        }
        result.push(text);
        if result.len() >= limit {
            break;
        }
    }
    result
}

pub fn sanitize_server_description(value: &str) -> String {
    let normalized = value.replace("\r\n", "\n").replace('\r', "\n");
    let cleaned = DESCRIPTION_CONTROL_RE.replace_all(&normalized, "");
    take_chars(cleaned.trim(), SERVER_DESCRIPTION_LENGTH)
}

pub fn sanitize_channel_name(value: &str) -> String {
    let name = SPACE_RE.replace_all(value.trim(), "-");
    let name = CHANNEL_CLEAN_RE.replace_all(&name, "");
    take_chars(&name, 32)
}

pub fn voice_id_from_text(text: &str) -> Option<String> {
    let captures = VOICE_ID_RE.captures(text.trim())?;
    captures.get(1).map(|value| value.as_str().to_string())
}

pub fn user_color_for(name: &str) -> String {
    let mut hash: i32 = 0;
    for unit in name.encode_utf16() {
        hash = hash.wrapping_mul(31).wrapping_add(unit as i32);
    }
    let degrees = ((hash as i64).abs() % 360) as u32;
    format!("hsl({}, 68%, 62%)", degrees)
}

pub fn valid_invite(value: &str) -> bool {
    INVITE_RE.is_match(value)
}

pub fn valid_email(value: &str) -> bool {
    EMAIL_RE.is_match(value)
}

pub fn valid_username(value: &str) -> bool {
    USERNAME_RE.is_match(value)
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Game {
    pub title: String,
    pub platform: String,
    pub color: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub email: String,
    pub username: String,
    pub display_name: String,
    pub handle: String,
    pub color: String,
    pub about: String,
    pub avatar: String,
    pub banner: Value,
    pub badges: Vec<String>,
    pub games: Vec<Game>,
    pub salt: String,
    pub hash: String,
    pub created_at: u64,
}

impl Account {
    pub fn display_name(&self) -> String {
        if self.display_name.trim().is_empty() {
            self.username.clone()
        } else {
            self.display_name.clone()
        }
    }

    pub fn effective_handle(&self) -> String {
        handle_for_account(&self.id, &self.username, &self.handle)
    }

    pub fn public_value(&self) -> Value {
        json!({
            "id": self.id,
            "email": self.email,
            "username": self.username,
            "displayName": self.display_name(),
            "handle": self.effective_handle(),
            "color": if self.color.is_empty() { "#3ee0a3" } else { &self.color },
            "about": self.about,
            "avatar": sanitize_avatar(&self.avatar),
            "banner": sanitize_banner(&self.banner),
            "badges": sanitize_badges(&Value::Array(self.badges.iter().cloned().map(Value::String).collect()), &["piwo"]),
            "games": self.games,
            "createdAt": self.created_at,
        })
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct SessionRecord {
    pub token: String,
    pub user_id: String,
    pub created_at: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct WebSessionRecord {
    pub user_id: String,
    pub created_at: u64,
    pub last_seen: u64,
    pub expires_at: u64,
    pub remember: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct ServerMember {
    pub id: String,
    pub name: String,
    pub color: String,
    pub owner: bool,
    pub joined_at: u64,
    pub last_seen: u64,
    pub handle: String,
    pub avatar: String,
    pub banner: Value,
    pub badges: Vec<String>,
    pub games: Vec<Game>,
    pub about: String,
    pub playing: Option<String>,
    pub playing_icon: Option<String>,
    pub playing_platform: Option<String>,
    pub playing_since: Option<u64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Channel {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub channel_type: String,
    pub created_at: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_id: Option<String>,
    pub author_id: String,
    pub author_name: String,
    pub author_color: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
    pub text: String,
    pub at: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Server {
    pub id: String,
    pub owner_id: String,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub tag: String,
    pub invite: String,
    pub owner_key: String,
    pub created_at: u64,
    pub banner: String,
    pub description: String,
    pub traits: Vec<String>,
    pub games: Vec<String>,
    pub channels: Vec<Channel>,
    pub members: Vec<ServerMember>,
    pub messages: HashMap<String, Vec<Message>>,
    pub dms: HashMap<String, Vec<Message>>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct JoinedEntry {
    pub user_id: String,
    pub id: String,
    pub address: String,
    pub secure: bool,
    pub invite: String,
    pub name: String,
    pub color: String,
    pub icon: String,
    pub tag: String,
    pub banner: Value,
    pub description: String,
    pub traits: Vec<String>,
    pub games: Vec<String>,
    pub member_id: String,
    pub joined_at: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct AccountStore {
    pub users: Vec<Account>,
    pub session: Option<SessionRecord>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct WebSessionStore {
    pub sessions: HashMap<String, WebSessionRecord>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct ServersStore {
    pub hosted: Vec<Server>,
    pub joined: Vec<JoinedEntry>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct ChatStore {
    pub rooms: Value,
    pub dms: HashMap<String, Vec<Message>>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct VoiceStore {
    pub items: HashMap<String, VoiceItem>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct VoiceItem {
    pub id: String,
    pub scope: String,
    pub owner_id: String,
    pub mime: String,
    pub ext: String,
    pub file: String,
    pub size: u64,
    pub duration: f64,
    pub at: u64,
}

#[derive(Clone, Debug, Default)]
pub struct OnlineUser {
    pub name: String,
    pub color: String,
    pub handle: String,
    pub status: String,
    pub playing: Option<String>,
    pub playing_icon: Option<String>,
    pub playing_platform: Option<String>,
    pub playing_since: Option<u64>,
    pub since: u64,
    pub last_seen: u64,
}

impl OnlineUser {
    pub fn visible_status(&self) -> &str {
        if self.status == "invisible" {
            "offline"
        } else {
            &self.status
        }
    }

    pub fn is_online(&self) -> bool {
        self.status != "invisible"
    }
}

pub fn profile_patch(msg: &Value) -> Map<String, Value> {
    let mut patch = Map::new();
    let Some(object) = msg.as_object() else {
        return patch;
    };
    if let Some(value) = object.get("handle").and_then(Value::as_str) {
        patch.insert("handle".to_string(), Value::String(sanitize_handle(value)));
    }
    if let Some(value) = object.get("avatar").and_then(Value::as_str) {
        patch.insert("avatar".to_string(), Value::String(sanitize_avatar(value)));
    }
    if object.contains_key("banner") {
        patch.insert(
            "banner".to_string(),
            sanitize_banner(object.get("banner").unwrap_or(&Value::Null)),
        );
    }
    if let Some(value) = object.get("badges").filter(|value| value.is_array()) {
        let badges = sanitize_badges(value, &[]);
        patch.insert(
            "badges".to_string(),
            Value::Array(badges.into_iter().map(Value::String).collect()),
        );
    }
    if let Some(value) = object.get("games").filter(|value| value.is_array()) {
        patch.insert("games".to_string(), json!(sanitize_games(value)));
    }
    if let Some(value) = object.get("about").and_then(Value::as_str) {
        patch.insert(
            "about".to_string(),
            Value::String(take_chars(value.trim(), 160)),
        );
    }
    if let Some(value) = object.get("playing") {
        if value.is_string() || value.is_null() {
            let title = if let Some(text) = value.as_str() {
                take_chars(text.trim(), 40)
            } else {
                String::new()
            };
            patch.insert(
                "playing".to_string(),
                if title.is_empty() {
                    Value::Null
                } else {
                    Value::String(title.clone())
                },
            );
            let since = object
                .get("playingSince")
                .or_else(|| object.get("since"))
                .and_then(Value::as_f64)
                .unwrap_or(0.0);
            patch.insert(
                "playingSince".to_string(),
                if !title.is_empty() && since > 0.0 {
                    json!(since as u64)
                } else {
                    Value::Null
                },
            );
            let icon = object
                .get("playingIcon")
                .and_then(Value::as_str)
                .map(sanitize_game_icon)
                .unwrap_or_default();
            patch.insert(
                "playingIcon".to_string(),
                if title.is_empty() {
                    Value::Null
                } else {
                    Value::String(icon)
                },
            );
            let platform = object
                .get("playingPlatform")
                .and_then(Value::as_str)
                .map(sanitize_game_platform)
                .unwrap_or_else(|| "other".to_string());
            patch.insert(
                "playingPlatform".to_string(),
                if title.is_empty() {
                    Value::Null
                } else {
                    Value::String(platform)
                },
            );
        }
    }
    patch
}
