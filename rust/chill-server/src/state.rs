use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use axum::extract::ws::{CloseFrame, Message as WsMessage};
use parking_lot::{Mutex, RwLock};
use rand::RngCore;
use serde::Serialize;
use serde_json::{json, Map, Value};
use tokio::sync::mpsc::UnboundedSender;
use uuid::Uuid;

use crate::config::Config;
use crate::model::*;

pub const WEB_SESSION_REMEMBER_TTL: u64 = 30 * 24 * 60 * 60 * 1000;
pub const WEB_SESSION_SHORT_TTL: u64 = 12 * 60 * 60 * 1000;
pub const WEB_SESSION_LIMIT_PER_USER: usize = 20;
pub const VOICE_TOKEN_TTL: u64 = 7 * 24 * 60 * 60 * 1000;
pub const VOICE_FRAME_MAX: usize = 32 * 1024;
pub const SCREEN_FRAME_MAX: usize = 220 * 1024;
pub const SCREEN_FRAME_MAGIC: [u8; 4] = [0x43, 0x53, 0x53, 0x01];
pub const JOIN_FAILURE_LIMIT: usize = 30;
pub const JOIN_FAILURE_WINDOW: u64 = 60_000;

const INVITE_ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

#[derive(Clone, Debug)]
pub struct ServerSession {
    pub server_id: String,
    pub member_id: String,
    pub name: String,
    pub color: String,
    pub owner: bool,
}

#[derive(Clone)]
pub struct Conn {
    pub id: u64,
    pub tx: UnboundedSender<WsMessage>,
    pub web_token: String,
    pub web_user_id: Option<String>,
    pub user_id: Option<String>,
    pub server: Option<ServerSession>,
    pub voice_channel: Option<String>,
}

impl Conn {
    pub fn send_json(&self, value: &Value) {
        let _ = self
            .tx
            .send(WsMessage::Text(value.to_string().into()));
    }

    pub fn send_binary(&self, bytes: Vec<u8>) {
        let _ = self.tx.send(WsMessage::Binary(bytes.into()));
    }

    pub fn close(&self, code: u16, reason: &str) {
        let _ = self.tx.send(WsMessage::Close(Some(CloseFrame {
            code,
            reason: reason.to_string().into(),
        })));
    }
}

#[derive(Clone, Debug)]
pub struct VoiceParticipant {
    pub member_id: String,
    pub name: String,
    pub color: String,
    pub muted: bool,
    pub deafened: bool,
    pub sharing: bool,
    pub share_name: String,
    pub conn_id: u64,
}

#[derive(Clone, Debug)]
pub struct VoiceToken {
    pub scope: String,
    pub member_id: String,
    pub conn_id: u64,
    pub expires_at: u64,
}

#[derive(Clone, Debug, Default)]
pub struct LoginAttempt {
    pub count: u32,
    pub until: u64,
}

pub struct AppState {
    pub cfg: Config,
    pub web_token: String,
    pub accounts: RwLock<AccountStore>,
    pub volatile_session: Mutex<Option<SessionRecord>>,
    pub web_sessions: RwLock<WebSessionStore>,
    pub servers: RwLock<ServersStore>,
    pub chat: RwLock<ChatStore>,
    pub voice: RwLock<VoiceStore>,
    pub attachments: RwLock<AttachmentStore>,
    pub friendships: RwLock<FriendshipStore>,
    pub online: RwLock<HashMap<String, OnlineUser>>,
    pub connections: Mutex<HashMap<u64, Conn>>,
    pub user_conns: Mutex<HashMap<String, u64>>,
    pub voice_rooms:
        Mutex<HashMap<String, HashMap<String, HashMap<String, VoiceParticipant>>>>,
    pub spotify_rooms: Mutex<HashMap<String, HashMap<String, Value>>>,
    pub voice_tokens: Mutex<HashMap<String, VoiceToken>>,
    pub login_attempts: Mutex<HashMap<String, LoginAttempt>>,
    pub join_failures: Mutex<HashMap<String, Vec<u64>>>,
    next_conn_id: AtomicU64,
}

impl AppState {
    pub fn new(cfg: Config) -> Self {
        fs::create_dir_all(&cfg.data_dir).ok();
        let accounts = load_json::<AccountStore>(&cfg.data_dir.join("accounts.json"));
        let mut web_sessions = load_json::<WebSessionStore>(&cfg.data_dir.join("web-sessions.json"));
        let now = now_ms();
        web_sessions.sessions.retain(|_, record| {
            !record.user_id.is_empty() && record.expires_at > now
        });
        let mut servers = load_json::<ServersStore>(&cfg.data_dir.join("servers.json"));
        normalize_servers(&mut servers);
        let mut chat = load_json::<ChatStore>(&cfg.data_dir.join("chat-data.json"));
        if !chat.rooms.is_object() {
            chat.rooms = json!({});
        }
        let voice = load_json::<VoiceStore>(&cfg.data_dir.join("voice").join("index.json"));
        let attachments =
            load_json::<AttachmentStore>(&cfg.data_dir.join("attachments").join("index.json"));
        let friendships = load_json::<FriendshipStore>(&cfg.data_dir.join("friendships.json"));
        let mut rng = rand::thread_rng();
        let mut token_bytes = [0u8; 24];
        rng.fill_bytes(&mut token_bytes);

        Self {
            cfg,
            web_token: hex::encode(token_bytes),
            accounts: RwLock::new(accounts),
            volatile_session: Mutex::new(None),
            web_sessions: RwLock::new(web_sessions),
            servers: RwLock::new(servers),
            chat: RwLock::new(chat),
            voice: RwLock::new(voice),
            attachments: RwLock::new(attachments),
            friendships: RwLock::new(friendships),
            online: RwLock::new(HashMap::new()),
            connections: Mutex::new(HashMap::new()),
            user_conns: Mutex::new(HashMap::new()),
            voice_rooms: Mutex::new(HashMap::new()),
            spotify_rooms: Mutex::new(HashMap::new()),
            voice_tokens: Mutex::new(HashMap::new()),
            login_attempts: Mutex::new(HashMap::new()),
            join_failures: Mutex::new(HashMap::new()),
            next_conn_id: AtomicU64::new(1),
        }
    }

    pub fn accounts_path(&self) -> PathBuf {
        self.cfg.data_dir.join("accounts.json")
    }
    pub fn servers_path(&self) -> PathBuf {
        self.cfg.data_dir.join("servers.json")
    }
    pub fn chat_path(&self) -> PathBuf {
        self.cfg.data_dir.join("chat-data.json")
    }
    pub fn web_sessions_path(&self) -> PathBuf {
        self.cfg.data_dir.join("web-sessions.json")
    }
    pub fn voice_dir(&self) -> PathBuf {
        self.cfg.data_dir.join("voice")
    }
    pub fn voice_index_path(&self) -> PathBuf {
        self.voice_dir().join("index.json")
    }
    pub fn attachments_dir(&self) -> PathBuf {
        self.cfg.data_dir.join("attachments")
    }
    pub fn attachments_index_path(&self) -> PathBuf {
        self.attachments_dir().join("index.json")
    }
    pub fn friendships_path(&self) -> PathBuf {
        self.cfg.data_dir.join("friendships.json")
    }

    pub fn save_accounts(&self) {
        persist(&self.accounts_path(), &*self.accounts.read(), true);
    }
    pub fn save_servers(&self) {
        persist(&self.servers_path(), &*self.servers.read(), true);
    }
    pub fn save_sessions(&self) {
        persist(&self.web_sessions_path(), &*self.web_sessions.read(), true);
    }
    pub fn save_chat(&self) {
        persist(&self.chat_path(), &*self.chat.read(), false);
    }
    pub fn save_voice(&self) {
        fs::create_dir_all(self.voice_dir()).ok();
        persist(&self.voice_index_path(), &*self.voice.read(), false);
    }
    pub fn save_attachments(&self) {
        fs::create_dir_all(self.attachments_dir()).ok();
        persist(&self.attachments_index_path(), &*self.attachments.read(), false);
    }
    pub fn save_friendships(&self) {
        persist(&self.friendships_path(), &*self.friendships.read(), false);
    }

    // ---------- Accounts ----------
    pub fn find_user(&self, id: &str) -> Option<Account> {
        self.accounts
            .read()
            .users
            .iter()
            .find(|user| user.id == id)
            .cloned()
    }

    pub fn find_user_by_identifier(&self, identifier: &str) -> Option<Account> {
        let value = identifier.trim().to_lowercase();
        self.accounts.read().users.iter().find(|user| {
            (!user.email.is_empty() && user.email.to_lowercase() == value)
                || (!user.username.is_empty() && user.username.to_lowercase() == value)
        }).cloned()
    }

    pub fn all_public_users(&self) -> Vec<Value> {
        self.accounts
            .read()
            .users
            .iter()
            .map(Account::public_value)
            .collect()
    }

    pub fn active_session_user(&self) -> Option<Account> {
        let user_id = {
            let store = self.accounts.read();
            store
                .session
                .as_ref()
                .map(|record| record.user_id.clone())
                .or_else(|| {
                    self.volatile_session
                        .lock()
                        .as_ref()
                        .map(|record| record.user_id.clone())
                })
        }?;
        self.find_user(&user_id)
    }

    pub fn set_account_session(&self, user_id: &str, remember: bool) -> Account {
        let mut rng = rand::thread_rng();
        let mut bytes = [0u8; 32];
        rng.fill_bytes(&mut bytes);
        let token = hex::encode(bytes);
        let record = SessionRecord {
            token,
            user_id: user_id.to_string(),
            created_at: now_ms(),
        };
        {
            let mut store = self.accounts.write();
            if remember {
                store.session = Some(record);
                *self.volatile_session.lock() = None;
            } else {
                store.session = None;
                *self.volatile_session.lock() = Some(record);
            }
        }
        self.save_accounts();
        self.find_user(user_id).unwrap_or_default()
    }

    pub fn clear_account_session(&self) {
        self.accounts.write().session = None;
        *self.volatile_session.lock() = None;
        self.save_accounts();
    }

    // ---------- Web sessions ----------
    pub fn create_web_session(&self, user_id: &str, remember: bool) -> String {
        let mut rng = rand::thread_rng();
        let mut bytes = [0u8; 32];
        rng.fill_bytes(&mut bytes);
        let token = hex::encode(bytes);
        let now = now_ms();
        let ttl = if remember {
            WEB_SESSION_REMEMBER_TTL
        } else {
            WEB_SESSION_SHORT_TTL
        };
        {
            let mut store = self.web_sessions.write();
            store.sessions.retain(|_, record| {
                !record.user_id.is_empty() && record.expires_at > now
            });
            store.sessions.insert(
                token.clone(),
                WebSessionRecord {
                    user_id: user_id.to_string(),
                    created_at: now,
                    last_seen: now,
                    expires_at: now + ttl,
                    remember,
                },
            );
            let mut owned: Vec<(String, u64)> = store
                .sessions
                .iter()
                .filter(|(_, record)| record.user_id == user_id)
                .map(|(token, record)| (token.clone(), record.created_at))
                .collect();
            owned.sort_by_key(|(_, created)| *created);
            while owned.len() > WEB_SESSION_LIMIT_PER_USER {
                let (old_token, _) = owned.remove(0);
                store.sessions.remove(&old_token);
            }
        }
        self.save_sessions();
        token
    }

    pub fn find_web_session(&self, token: &str) -> Option<WebSessionRecord> {
        if token.is_empty() {
            return None;
        }
        let now = now_ms();
        let mut expired = false;
        let mut refresh = false;
        let result = {
            let mut store = self.web_sessions.write();
            match store.sessions.get_mut(token) {
                None => None,
                Some(record) => {
                    if record.expires_at <= now || self.find_user(&record.user_id).is_none() {
                        expired = true;
                        None
                    } else {
                        if now.saturating_sub(record.last_seen) > 5 * 60 * 1000 {
                            record.last_seen = now;
                            refresh = true;
                        }
                        Some(record.clone())
                    }
                }
            }
        };
        if expired {
            self.web_sessions.write().sessions.remove(token);
        }
        if refresh {
            self.save_sessions();
        }
        result
    }

    pub fn web_user_for_token(&self, token: &str) -> Option<Account> {
        let record = self.find_web_session(token)?;
        self.find_user(&record.user_id)
    }

    pub fn destroy_web_session(&self, token: &str) {
        if token.is_empty() {
            return;
        }
        let removed = self.web_sessions.write().sessions.remove(token).is_some();
        if removed {
            self.save_sessions();
        }
        self.close_web_session_sockets(token);
    }

    pub fn destroy_user_web_sessions(&self, user_id: &str, except: &str) {
        let mut tokens = Vec::new();
        {
            let mut store = self.web_sessions.write();
            store.sessions.retain(|token, record| {
                if record.user_id == user_id && token != except {
                    tokens.push(token.clone());
                    false
                } else {
                    true
                }
            });
        }
        if !tokens.is_empty() {
            self.save_sessions();
        }
        for token in tokens {
            self.close_web_session_sockets(&token);
        }
    }

    pub fn close_web_session_sockets(&self, token: &str) {
        let conns: Vec<Conn> = self
            .connections
            .lock()
            .values()
            .filter(|conn| conn.web_token == token)
            .cloned()
            .collect();
        for conn in conns {
            conn.close(4001, "session-ended");
        }
    }

    // ---------- Login limits ----------
    pub fn login_lock_remaining(&self, key: &str) -> u64 {
        let now = now_ms();
        let mut attempts = self.login_attempts.lock();
        if let Some(entry) = attempts.get(key) {
            if entry.until > now {
                return entry.until - now;
            }
            if entry.until > 0 && entry.until <= now {
                attempts.remove(key);
            }
        }
        0
    }

    pub fn note_failed_login(&self, key: &str) {
        let mut attempts = self.login_attempts.lock();
        let entry = attempts.entry(key.to_string()).or_default();
        entry.count += 1;
        if entry.count >= 5 {
            entry.until = now_ms() + 60_000;
            entry.count = 0;
        }
    }

    pub fn clear_login_attempts(&self, key: &str) {
        self.login_attempts.lock().remove(key);
    }

    // ---------- Connections ----------
    pub fn register_conn(
        &self,
        tx: UnboundedSender<WsMessage>,
        web_token: String,
        web_user_id: Option<String>,
    ) -> u64 {
        let id = self.next_conn_id.fetch_add(1, Ordering::SeqCst);
        self.connections.lock().insert(
            id,
            Conn {
                id,
                tx,
                web_token,
                web_user_id,
                user_id: None,
                server: None,
                voice_channel: None,
            },
        );
        id
    }

    pub fn conn(&self, id: u64) -> Option<Conn> {
        self.connections.lock().get(&id).cloned()
    }

    pub fn conns(&self) -> Vec<Conn> {
        self.connections.lock().values().cloned().collect()
    }

    pub fn set_conn_user(&self, id: u64, user_id: Option<String>) {
        if let Some(conn) = self.connections.lock().get_mut(&id) {
            conn.user_id = user_id;
        }
    }

    pub fn set_conn_server(&self, id: u64, session: Option<ServerSession>) {
        if let Some(conn) = self.connections.lock().get_mut(&id) {
            conn.server = session;
        }
    }

    pub fn set_conn_voice_channel(&self, id: u64, channel: Option<String>) {
        if let Some(conn) = self.connections.lock().get_mut(&id) {
            conn.voice_channel = channel;
        }
    }

    pub fn set_online(&self, user_id: &str, conn_id: u64, user: OnlineUser) {
        self.user_conns.lock().insert(user_id.to_string(), conn_id);
        self.online.write().insert(user_id.to_string(), user);
    }

    pub fn update_online<F>(&self, user_id: &str, update: F)
    where
        F: FnOnce(&mut OnlineUser),
    {
        if let Some(user) = self.online.write().get_mut(user_id) {
            update(user);
        }
    }

    pub fn leave_online(&self, user_id: &str, conn_id: u64) {
        let owned = {
            let mut map = self.user_conns.lock();
            if map.get(user_id).copied() == Some(conn_id) {
                map.remove(user_id);
                true
            } else {
                false
            }
        };
        if owned {
            self.online.write().remove(user_id);
        }
    }

    pub fn users_payload(&self) -> Vec<Value> {
        let online = self.online.read();
        self.accounts
            .read()
            .users
            .iter()
            .map(|account| {
                let mut value = account.public_value();
                value["name"] = json!(account.display_name());
                let record = online.get(&account.id);
                let is_online = record.map(OnlineUser::is_online).unwrap_or(false);
                let playing = if is_online {
                    record
                        .and_then(|r| r.playing.clone())
                        .map(|text| take_chars(text.trim(), 40))
                        .filter(|text| !text.is_empty())
                } else {
                    None
                };
                value["status"] = json!(if is_online {
                    record.map(|r| r.visible_status()).unwrap_or("offline")
                } else {
                    "offline"
                });
                value["playing"] = playing
                    .as_ref()
                    .map(|text| Value::String(text.clone()))
                    .unwrap_or(Value::Null);
                value["playingIcon"] = playing
                    .as_ref()
                    .and_then(|_| record.and_then(|r| r.playing_icon.clone()))
                    .map(Value::String)
                    .unwrap_or(Value::Null);
                value["playingPlatform"] = playing
                    .as_ref()
                    .and_then(|_| record.and_then(|r| r.playing_platform.clone()))
                    .map(Value::String)
                    .unwrap_or(Value::Null);
                value["playingSince"] = playing
                    .as_ref()
                    .and_then(|_| record.and_then(|r| r.playing_since))
                    .map(|value| json!(value))
                    .unwrap_or(Value::Null);
                value["online"] = json!(is_online);
                value["lastSeen"] = record
                    .map(|r| json!(r.last_seen))
                    .unwrap_or(Value::Null);
                value
            })
            .collect()
    }

    pub fn broadcast_global(&self, event_type: &str, mut payload: Value) {
        if !payload.is_object() {
            payload = json!({});
        }
        payload["type"] = json!(event_type);
        payload["at"] = json!(now_ms());
        let targets: Vec<u64> = self.user_conns.lock().values().copied().collect();
        for conn_id in targets {
            if let Some(conn) = self.conn(conn_id) {
                conn.send_json(&payload);
            }
        }
    }

    pub fn broadcast_server(&self, server_id: &str, mut payload: Value, except: Option<u64>) {
        if !payload.is_object() {
            payload = json!({});
        }
        payload["at"] = json!(now_ms());
        for conn in self.conns() {
            if Some(conn.id) == except {
                continue;
            }
            if conn.server.as_ref().map(|s| s.server_id == server_id).unwrap_or(false) {
                conn.send_json(&payload);
            }
        }
    }

    // ---------- Servers ----------
    pub fn find_hosted(&self, id: &str) -> Option<Server> {
        self.servers
            .read()
            .hosted
            .iter()
            .find(|server| server.id == id)
            .cloned()
    }

    pub fn hosted_by_owner(&self, user_id: &str) -> Vec<Server> {
        self.servers
            .read()
            .hosted
            .iter()
            .filter(|server| server.owner_id == user_id)
            .cloned()
            .collect()
    }

    pub fn joined_for_user(&self, user_id: &str) -> Vec<JoinedEntry> {
        self.servers
            .read()
            .joined
            .iter()
            .filter(|entry| entry.user_id == user_id)
            .cloned()
            .collect()
    }

    pub fn server_members_payload(&self, server: &Server) -> Vec<Value> {
        let online: HashSet<String> = self
            .conns()
            .into_iter()
            .filter_map(|conn| conn.server.map(|session| session.member_id))
            .collect();
        let mut members: Vec<Value> = server
            .members
            .iter()
            .map(|member| {
                let is_online = online.contains(&member.id);
                let playing = if is_online {
                    member
                        .playing
                        .clone()
                        .map(|text| take_chars(text.trim(), 40))
                        .filter(|text| !text.is_empty())
                } else {
                    None
                };
                json!({
                    "id": member.id,
                    "name": member.name,
                    "color": member.color,
                    "owner": member.owner,
                    "online": is_online,
                    "lastSeen": member.last_seen,
                    "about": take_chars(&member.about, 160),
                    "handle": if member.handle.is_empty() { handle_for_account(&member.id, &member.name, "") } else { member.handle.clone() },
                    "avatar": sanitize_avatar(&member.avatar),
                    "banner": sanitize_banner(&member.banner),
                    "badges": member.badges,
                    "games": member.games,
                    "playing": playing,
                    "playingIcon": playing.as_ref().map(|_| sanitize_game_icon(member.playing_icon.as_deref().unwrap_or(""))),
                    "playingPlatform": playing.as_ref().map(|_| sanitize_game_platform(member.playing_platform.as_deref().unwrap_or(""))),
                    "playingSince": if is_online && playing.is_some() { member.playing_since } else { None },
                })
            })
            .collect();
        members.sort_by(|a, b| {
            let online_a = a["online"].as_bool().unwrap_or(false);
            let online_b = b["online"].as_bool().unwrap_or(false);
            online_b.cmp(&online_a).then_with(|| {
                let name_a = a["name"].as_str().unwrap_or("").to_lowercase();
                let name_b = b["name"].as_str().unwrap_or("").to_lowercase();
                name_a.cmp(&name_b)
            })
        });
        members
    }

    pub fn broadcast_server_members(&self, server: &Server) {
        self.broadcast_server(
            &server.id,
            json!({ "type": "server:members", "members": self.server_members_payload(server) }),
            None,
        );
    }

    pub fn server_dms_payload(&self, server: &Server, member_id: &str) -> Map<String, Value> {
        let mut result = Map::new();
        for (key, list) in &server.dms {
            let parts: Vec<&str> = key.split('|').collect();
            if parts.len() != 2 {
                continue;
            }
            if parts[0] == member_id || parts[1] == member_id {
                let start = list.len().saturating_sub(300);
                result.insert(key.clone(), json!(list[start..]));
            }
        }
        result
    }

    pub fn close_server_sessions(&self, server_id: &str, payload: Value) {
        let mut message = payload;
        if message.is_object() {
            message["at"] = json!(now_ms());
        }
        let conns: Vec<Conn> = self
            .conns()
            .into_iter()
            .filter(|conn| conn.server.as_ref().map(|s| s.server_id == server_id).unwrap_or(false))
            .collect();
        for conn in conns {
            conn.send_json(&message);
            self.detach_server(conn.id);
        }
        self.voice_rooms.lock().remove(server_id);
    }

    // ---------- Voice ----------
    pub fn issue_voice_token(&self, conn_id: u64, scope: &str, member_id: &str) -> String {
        let mut rng = rand::thread_rng();
        let mut bytes = [0u8; 24];
        rng.fill_bytes(&mut bytes);
        let token = hex::encode(bytes);
        let mut tokens = self.voice_tokens.lock();
        let now = now_ms();
        tokens.retain(|_, entry| entry.expires_at > now);
        tokens.insert(
            token.clone(),
            VoiceToken {
                scope: scope.to_string(),
                member_id: member_id.to_string(),
                conn_id,
                expires_at: now + VOICE_TOKEN_TTL,
            },
        );
        token
    }

    pub fn revoke_voice_tokens(&self, conn_id: u64, scope_prefix: &str) {
        self.voice_tokens.lock().retain(|_, entry| {
            if entry.conn_id != conn_id {
                return true;
            }
            if scope_prefix.is_empty() || entry.scope.starts_with(scope_prefix) {
                return false;
            }
            true
        });
    }

    pub fn active_voice_token(&self, token: &str) -> Option<VoiceToken> {
        if token.is_empty() {
            return None;
        }
        let now = now_ms();
        let mut tokens = self.voice_tokens.lock();
        let entry = tokens.get(token).cloned();
        let Some(entry) = entry else { return None };
        if entry.expires_at <= now {
            tokens.remove(token);
            return None;
        }
        drop(tokens);
        if !self.voice_scope_allowed(&entry.scope, &entry.member_id) {
            return None;
        }
        Some(entry)
    }

    pub fn voice_scope_allowed(&self, scope: &str, member_id: &str) -> bool {
        if scope == "local" {
            return self.find_user(member_id).is_some();
        }
        if let Some(server_id) = scope.strip_prefix("server:") {
            return self
                .find_hosted(server_id)
                .map(|server| server.members.iter().any(|member| member.id == member_id))
                .unwrap_or(false);
        }
        false
    }

    pub fn voice_referenced_elsewhere(&self, id: &str) -> bool {
        if id.is_empty() {
            return false;
        }
        let collect = |messages: &[Message]| {
            messages
                .iter()
                .any(|message| voice_id_from_text(&message.text).as_deref() == Some(id))
        };
        let servers = self.servers.read();
        for server in &servers.hosted {
            for list in server.messages.values() {
                if collect(list) {
                    return true;
                }
            }
            for list in server.dms.values() {
                if collect(list) {
                    return true;
                }
            }
        }
        drop(servers);
        let chat = self.chat.read();
        for list in chat.dms.values() {
            if collect(list) {
                return true;
            }
        }
        false
    }

    pub fn remove_voice_item(&self, id: &str, force: bool) -> bool {
        if id.len() != 32 || !id.chars().all(|c| c.is_ascii_hexdigit()) {
            return false;
        }
        if !force && self.voice_referenced_elsewhere(id) {
            return false;
        }
        let item = {
            let mut store = self.voice.write();
            store.items.remove(id)
        };
        let Some(item) = item else { return false };
        let _ = fs::remove_file(self.voice_dir().join(&item.file));
        self.save_voice();
        true
    }

    pub fn remove_voice_from_messages(&self, messages: &[Message]) -> bool {
        let mut changed = false;
        for message in messages {
            if let Some(id) = voice_id_from_text(&message.text) {
                if self.remove_voice_item(&id, false) {
                    changed = true;
                }
            }
        }
        changed
    }

    // ---------- Attachments ----------
    pub fn attachment_referenced_elsewhere(&self, id: &str) -> bool {
        if id.is_empty() {
            return false;
        }
        let collect = |messages: &[Message]| {
            messages
                .iter()
                .any(|message| attachment_id_from_text(&message.text).as_deref() == Some(id))
        };
        let servers = self.servers.read();
        for server in &servers.hosted {
            for list in server.messages.values() {
                if collect(list) {
                    return true;
                }
            }
            for list in server.dms.values() {
                if collect(list) {
                    return true;
                }
            }
        }
        drop(servers);
        let chat = self.chat.read();
        for list in chat.dms.values() {
            if collect(list) {
                return true;
            }
        }
        false
    }

    pub fn remove_attachment_item(&self, id: &str, force: bool) -> bool {
        if id.len() != 32 || !id.chars().all(|c| c.is_ascii_hexdigit()) {
            return false;
        }
        if !force && self.attachment_referenced_elsewhere(id) {
            return false;
        }
        let item = {
            let mut store = self.attachments.write();
            store.items.remove(id)
        };
        let Some(item) = item else { return false };
        let _ = fs::remove_file(self.attachments_dir().join(&item.file));
        self.save_attachments();
        true
    }

    pub fn remove_attachments_from_messages(&self, messages: &[Message]) -> bool {
        let mut changed = false;
        for message in messages {
            if let Some(id) = attachment_id_from_text(&message.text) {
                if self.remove_attachment_item(&id, false) {
                    changed = true;
                }
            }
        }
        changed
    }

    pub fn remove_media_from_messages(&self, messages: &[Message]) -> bool {
        let voice = self.remove_voice_from_messages(messages);
        let attachments = self.remove_attachments_from_messages(messages);
        voice || attachments
    }

    // ---------- Friends ----------
    pub fn friend_state_payload(&self, user_id: &str) -> Value {
        let mut friends: Vec<String> = Vec::new();
        let mut incoming: Vec<Value> = Vec::new();
        let mut outgoing: Vec<Value> = Vec::new();
        for entry in self.friendships.read().entries.values() {
            if entry.a != user_id && entry.b != user_id {
                continue;
            }
            let other = if entry.a == user_id { &entry.b } else { &entry.a };
            if entry.status == "accepted" {
                friends.push(other.clone());
            } else if entry.requested_by == user_id {
                outgoing.push(json!({ "id": other, "at": entry.at }));
            } else {
                incoming.push(json!({ "id": other, "at": entry.at }));
            }
        }
        friends.sort();
        incoming.sort_by_key(|item| std::cmp::Reverse(item.get("at").and_then(Value::as_u64).unwrap_or(0)));
        outgoing.sort_by_key(|item| std::cmp::Reverse(item.get("at").and_then(Value::as_u64).unwrap_or(0)));
        json!({
            "type": "friends:state",
            "friends": friends,
            "incoming": incoming,
            "outgoing": outgoing,
        })
    }

    pub fn send_friend_state(&self, user_id: &str) {
        if user_id.is_empty() {
            return;
        }
        let conn_id = self.user_conns.lock().get(user_id).copied();
        if let Some(conn_id) = conn_id {
            if let Some(conn) = self.conn(conn_id) {
                conn.send_json(&self.friend_state_payload(user_id));
            }
        }
    }

    pub fn broadcast_friend_state(&self, user_ids: &[String]) {
        let mut seen = HashSet::new();
        for user_id in user_ids {
            if user_id.is_empty() || !seen.insert(user_id.clone()) {
                continue;
            }
            self.send_friend_state(user_id);
        }
    }

    pub fn friendship_entry(&self, a: &str, b: &str) -> Option<Friendship> {
        if a.is_empty() || b.is_empty() || a == b {
            return None;
        }
        self.friendships.read().entries.get(&friendship_key(a, b)).cloned()
    }

    pub fn are_friends(&self, a: &str, b: &str) -> bool {
        self.friendship_entry(a, b)
            .map(|entry| entry.status == "accepted")
            .unwrap_or(false)
    }

    pub fn friend_request(&self, from: &str, to: &str) -> Result<(), &'static str> {
        if from.is_empty() || to.is_empty() || from == to {
            return Err("Nieprawidłowy użytkownik.");
        }
        if self.find_user(to).is_none() {
            return Err("Nie znaleziono użytkownika.");
        }
        let key = friendship_key(from, to);
        let mut store = self.friendships.write();
        if let Some(entry) = store.entries.get_mut(&key) {
            if entry.status == "accepted" {
                return Ok(());
            }
            if entry.requested_by == to {
                entry.status = "accepted".to_string();
                entry.accepted_at = now_ms();
                drop(store);
                self.save_friendships();
                self.broadcast_friend_state(&[from.to_string(), to.to_string()]);
                return Ok(());
            }
            return Ok(());
        }
        if store.entries.len() >= 2000 {
            return Err("Lista zaproszeń jest pełna.");
        }
        store.entries.insert(
            key,
            Friendship {
                a: from.to_string(),
                b: to.to_string(),
                status: "pending".to_string(),
                requested_by: from.to_string(),
                at: now_ms(),
                accepted_at: 0,
            },
        );
        drop(store);
        self.save_friendships();
        self.broadcast_friend_state(&[from.to_string(), to.to_string()]);
        Ok(())
    }

    pub fn friend_accept(&self, from: &str, to: &str) -> bool {
        let key = friendship_key(from, to);
        let mut store = self.friendships.write();
        let Some(entry) = store.entries.get_mut(&key) else {
            return false;
        };
        if entry.status != "pending" || entry.requested_by != from {
            return false;
        }
        entry.status = "accepted".to_string();
        entry.accepted_at = now_ms();
        drop(store);
        self.save_friendships();
        self.broadcast_friend_state(&[from.to_string(), to.to_string()]);
        true
    }

    pub fn friend_decline(&self, from: &str, to: &str) -> bool {
        let key = friendship_key(from, to);
        let mut store = self.friendships.write();
        let remove = store
            .entries
            .get(&key)
            .map(|entry| entry.status != "accepted" && entry.requested_by == from)
            .unwrap_or(false);
        if !remove {
            return false;
        }
        store.entries.remove(&key);
        drop(store);
        self.save_friendships();
        self.broadcast_friend_state(&[from.to_string(), to.to_string()]);
        true
    }

    pub fn friend_remove(&self, a: &str, b: &str) -> bool {
        let key = friendship_key(a, b);
        let mut store = self.friendships.write();
        if store.entries.remove(&key).is_none() {
            return false;
        }
        drop(store);
        self.save_friendships();
        self.broadcast_friend_state(&[a.to_string(), b.to_string()]);
        true
    }

    // ---------- Spotify ----------
    pub fn spotify_state(&self, server_id: &str, channel_id: &str) -> Value {
        self.spotify_rooms
            .lock()
            .get(server_id)
            .and_then(|rooms| rooms.get(channel_id))
            .cloned()
            .unwrap_or(Value::Null)
    }

    pub fn set_spotify_state(&self, server_id: &str, channel_id: &str, state: Value) {
        let mut rooms = self.spotify_rooms.lock();
        rooms
            .entry(server_id.to_string())
            .or_default()
            .insert(channel_id.to_string(), state);
    }

    pub fn clear_spotify_state(&self, server_id: &str, channel_id: &str) -> bool {
        let mut rooms = self.spotify_rooms.lock();
        let Some(server_rooms) = rooms.get_mut(server_id) else {
            return false;
        };
        let removed = server_rooms.remove(channel_id).is_some();
        if server_rooms.is_empty() {
            rooms.remove(server_id);
        }
        removed
    }

    pub fn spotify_rooms_payload(&self, server_id: &str) -> Vec<Value> {
        self.spotify_rooms
            .lock()
            .get(server_id)
            .map(|rooms| {
                rooms
                    .iter()
                    .map(|(channel_id, state)| json!({ "channelId": channel_id, "state": state }))
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn broadcast_spotify(&self, server_id: &str, channel_id: &str) {
        self.broadcast_server(
            server_id,
            json!({
                "type": "server:spotify",
                "channelId": channel_id,
                "state": self.spotify_state(server_id, channel_id),
            }),
            None,
        );
    }

    // ---------- Join rate limit ----------
    pub fn join_rate_limited(&self, ip: &str) -> bool {
        if ip.is_empty() {
            return false;
        }
        let cutoff = now_ms().saturating_sub(JOIN_FAILURE_WINDOW);
        let mut failures = self.join_failures.lock();
        let Some(list) = failures.get_mut(ip) else {
            return false;
        };
        list.retain(|at| *at > cutoff);
        if list.is_empty() {
            failures.remove(ip);
            return false;
        }
        list.len() >= JOIN_FAILURE_LIMIT
    }

    pub fn note_join_failure(&self, ip: &str) {
        if ip.is_empty() {
            return;
        }
        let cutoff = now_ms().saturating_sub(JOIN_FAILURE_WINDOW);
        let mut failures = self.join_failures.lock();
        let list = failures.entry(ip.to_string()).or_default();
        list.retain(|at| *at > cutoff);
        list.push(now_ms());
        if failures.len() > 1000 {
            failures.retain(|_, list| list.iter().any(|at| *at > cutoff));
        }
    }

    pub fn clear_join_failures(&self, ip: &str) {
        self.join_failures.lock().remove(ip);
    }

    pub fn detach_server(&self, conn_id: u64) {
        let Some(conn) = self.conn(conn_id) else { return };
        let Some(session) = conn.server.clone() else { return };
        self.leave_voice(conn_id);
        self.set_conn_server(conn_id, None);
        self.revoke_voice_tokens(conn_id, "server:");
        if let Some(server) = self.find_hosted(&session.server_id) {
            {
                let mut store = self.servers.write();
                if let Some(found) = store.hosted.iter_mut().find(|item| item.id == server.id) {
                    if let Some(member) = found.members.iter_mut().find(|item| item.id == session.member_id)
                    {
                        member.last_seen = now_ms();
                    }
                }
            }
            self.save_servers();
            if let Some(updated) = self.find_hosted(&server.id) {
                self.broadcast_server_members(&updated);
            }
        }
    }

    pub fn leave_voice(&self, conn_id: u64) -> Option<(String, String)> {
        let conn = self.conn(conn_id)?;
        let session = conn.server.clone()?;
        let channel_id = conn.voice_channel.clone()?;
        self.set_conn_voice_channel(conn_id, None);
        let removed = {
            let mut rooms = self.voice_rooms.lock();
            let mut removed = false;
            if let Some(server_rooms) = rooms.get_mut(&session.server_id) {
                if let Some(room) = server_rooms.get_mut(&channel_id) {
                    if room
                        .get(&session.member_id)
                        .map(|participant| participant.conn_id == conn_id)
                        .unwrap_or(false)
                    {
                        room.remove(&session.member_id);
                        removed = true;
                    }
                    if room.is_empty() {
                        server_rooms.remove(&channel_id);
                    }
                }
                if server_rooms.is_empty() {
                    rooms.remove(&session.server_id);
                }
            }
            removed
        };
        if removed {
            self.broadcast_voice_channel(&session.server_id, &channel_id);
        }
        Some((session.server_id, channel_id))
    }

    pub fn voice_participants(&self, server_id: &str, channel_id: &str) -> Vec<Value> {
        let rooms = self.voice_rooms.lock();
        let Some(server_rooms) = rooms.get(server_id) else {
            return Vec::new();
        };
        let Some(room) = server_rooms.get(channel_id) else {
            return Vec::new();
        };
        let mut participants: Vec<Value> = room
            .values()
            .map(|participant| {
                json!({
                    "memberId": participant.member_id,
                    "name": participant.name,
                    "color": participant.color,
                    "muted": participant.muted,
                    "deafened": participant.deafened,
                    "sharing": participant.sharing,
                    "shareName": take_chars(&participant.share_name, 80),
                })
            })
            .collect();
        participants.sort_by(|a, b| {
            a["name"]
                .as_str()
                .unwrap_or("")
                .to_lowercase()
                .cmp(&b["name"].as_str().unwrap_or("").to_lowercase())
        });
        participants
    }

    pub fn broadcast_voice_channel(&self, server_id: &str, channel_id: &str) {
        self.broadcast_server(
            server_id,
            json!({
                "type": "server:voice",
                "channelId": channel_id,
                "participants": self.voice_participants(server_id, channel_id),
            }),
            None,
        );
    }

    pub fn remove_voice_channel(&self, server_id: &str, channel_id: &str) {
        let participants = {
            let mut rooms = self.voice_rooms.lock();
            let mut participants = Vec::new();
            if let Some(server_rooms) = rooms.get_mut(server_id) {
                if let Some(room) = server_rooms.remove(channel_id) {
                    participants = room.values().map(|item| item.conn_id).collect();
                }
                if server_rooms.is_empty() {
                    rooms.remove(server_id);
                }
            }
            participants
        };
        for conn_id in participants {
            self.set_conn_voice_channel(conn_id, None);
        }
        self.broadcast_server(
            server_id,
            json!({ "type": "server:voice", "channelId": channel_id, "participants": [] }),
            None,
        );
    }

    pub fn voice_rooms_payload(&self, server_id: &str) -> Vec<Value> {
        let rooms = self.voice_rooms.lock();
        let Some(server_rooms) = rooms.get(server_id) else {
            return Vec::new();
        };
        let mut result = Vec::new();
        for channel_id in server_rooms.keys() {
            let participants = self.voice_participants(server_id, channel_id);
            if participants.is_empty() {
                continue;
            }
            result.push(json!({ "channelId": channel_id, "participants": participants }));
        }
        result
    }
}

pub fn persist<T: Serialize + ?Sized>(path: &PathBuf, value: &T, pretty: bool) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).ok();
    }
    let data = if pretty {
        serde_json::to_string_pretty(value)
    } else {
        serde_json::to_string(value)
    };
    if let Ok(data) = data {
        if let Err(error) = fs::write(path, data) {
            eprintln!("[chill] Nie udało się zapisać {}: {}", path.display(), error);
        }
    }
}

fn load_json<T: serde::de::DeserializeOwned + Default>(path: &PathBuf) -> T {
    match fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(_) => T::default(),
    }
}

pub fn friendship_key(a: &str, b: &str) -> String {
    let mut parts = [a.to_string(), b.to_string()];
    parts.sort();
    format!("{}|{}", parts[0], parts[1])
}

pub fn random_hex(bytes: usize) -> String {
    let mut buffer = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buffer);
    hex::encode(buffer)
}

pub fn random_uuid() -> String {
    Uuid::new_v4().to_string()
}

pub fn new_invite_code() -> String {
    let mut rng = rand::thread_rng();
    let mut out = String::with_capacity(6);
    for _ in 0..6 {
        let index = (rng.next_u32() as usize) % INVITE_ALPHABET.len();
        out.push(INVITE_ALPHABET[index] as char);
    }
    out
}

pub fn unique_invite(servers: &ServersStore) -> String {
    for _ in 0..20 {
        let code = new_invite_code();
        if !servers.hosted.iter().any(|server| server.invite == code) {
            return code;
        }
    }
    new_invite_code()
}

pub fn make_channel_id() -> String {
    random_hex(6)
}

fn normalize_servers(store: &mut ServersStore) {
    store.hosted = store
        .hosted
        .drain(..)
        .filter(|server| !server.id.is_empty() && !server.owner_id.is_empty())
        .map(|mut server| {
            server.name = take_chars(server.name.trim(), 40);
            if server.name.is_empty() {
                server.name = "Serwer".to_string();
            }
            server.icon = take_chars(&server.icon, 4);
            if !is_valid_hex(&server.color) {
                server.color = "#3ee0a3".to_string();
            }
            server.tag = take_chars(
                &server
                    .tag
                    .to_uppercase()
                    .chars()
                    .filter(|c| c.is_ascii_alphanumeric())
                    .collect::<String>(),
                8,
            );
            server.banner = sanitize_server_banner(&Value::String(server.banner.clone()));
            server.description = sanitize_server_description(&server.description);
            server.traits = sanitize_server_text_list(
                &json!(server.traits),
                SERVER_TRAIT_LIMIT,
                SERVER_TRAIT_LENGTH,
            );
            server.games =
                sanitize_server_text_list(&json!(server.games), SERVER_GAME_LIMIT, SERVER_GAME_LENGTH);
            if !valid_invite(&server.invite) {
                server.invite = new_invite_code();
            }
            if server.owner_key.len() < 24 {
                server.owner_key = random_hex(24);
            }
            if server.created_at == 0 {
                server.created_at = now_ms();
            }
            server.channels.retain(|channel| !channel.id.is_empty() && !channel.name.is_empty());
            for channel in &mut server.channels {
                channel.name = take_chars(channel.name.trim(), 32);
                channel.channel_type = if channel.channel_type == "voice" {
                    "voice".to_string()
                } else {
                    "text".to_string()
                };
                if channel.created_at == 0 {
                    channel.created_at = now_ms();
                }
            }
            server.members.retain(|member| !member.id.is_empty());
            for member in &mut server.members {
                member.id = take_chars(&member.id, 64);
                member.name = take_chars(member.name.trim(), 32);
                if member.name.is_empty() {
                    member.name = "Gość".to_string();
                }
                if !is_valid_hex(&member.color) {
                    member.color = "#3ee0a3".to_string();
                }
                if member.joined_at == 0 {
                    member.joined_at = now_ms();
                }
                if member.last_seen == 0 {
                    member.last_seen = member.joined_at;
                }
                member.handle = sanitize_handle(&member.handle);
                member.avatar = sanitize_avatar(&member.avatar);
                member.banner = sanitize_banner(&member.banner);
                member.badges = sanitize_badges(&json!(member.badges), &["piwo"]);
                member.games = sanitize_games(&json!(member.games));
                member.about = take_chars(&member.about, 160);
            }
            let channel_ids: HashSet<String> =
                server.channels.iter().map(|channel| channel.id.clone()).collect();
            server.messages.retain(|id, list| {
                if !channel_ids.contains(id) {
                    return false;
                }
                let start = list.len().saturating_sub(300);
                *list = list[start..].to_vec();
                true
            });
            for channel in &server.channels {
                server.messages.entry(channel.id.clone()).or_default();
            }
            server.dms.retain(|key, list| {
                let parts: Vec<&str> = key.split('|').collect();
                if parts.len() != 2 || parts[0].is_empty() || parts[1].is_empty() {
                    return false;
                }
                let start = list.len().saturating_sub(500);
                *list = list[start..].to_vec();
                true
            });
            server
        })
        .collect();
    store.joined.retain(|entry| {
        !entry.id.is_empty() && !entry.user_id.is_empty() && !entry.address.is_empty() && !entry.invite.is_empty()
    });
}
