use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use axum::extract::ws::{Message as WsMessage, WebSocket};
use axum::http::HeaderMap;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Map, Value};
use tokio::sync::mpsc::unbounded_channel;

use crate::model::*;
use crate::state::*;

pub async fn handle(
    socket: WebSocket,
    state: Arc<AppState>,
    headers: HeaderMap,
    address: SocketAddr,
    web_token: String,
    web_user_id: Option<String>,
) {
    let ip = headers
        .get("cf-connecting-ip")
        .or_else(|| headers.get("x-forwarded-for"))
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(|value| value.trim().to_string())
        .unwrap_or_else(|| address.ip().to_string());
    let local = if state.cfg.public_web {
        web_user_id.is_some()
    } else {
        address.ip().is_loopback()
            && !headers.contains_key("cf-connecting-ip")
            && !headers.contains_key("cf-ray")
            && !headers.contains_key("x-forwarded-for")
    };

    let (mut sender, mut receiver) = socket.split();
    let (tx, mut rx) = unbounded_channel::<WsMessage>();
    let conn_id = state.register_conn(tx, web_token, web_user_id);

    let writer = tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            if sender.send(message).await.is_err() {
                break;
            }
        }
    });

    while let Some(Ok(message)) = receiver.next().await {
        match message {
            WsMessage::Text(text) => {
                if let Ok(value) = serde_json::from_str::<Value>(&text) {
                    handle_message(&state, conn_id, local, &ip, &value);
                }
            }
            WsMessage::Binary(data) => {
                relay_voice_frame(&state, conn_id, &data);
            }
            WsMessage::Ping(data) => {
                if let Some(conn) = state.conn(conn_id) {
                    let _ = conn.tx.send(WsMessage::Pong(data));
                }
            }
            WsMessage::Close(_) => break,
            _ => {}
        }
    }

    cleanup(&state, conn_id);
    writer.abort();
}

fn cleanup(state: &AppState, conn_id: u64) {
    state.detach_server(conn_id);
    state.revoke_voice_tokens(conn_id, "");
    let conn = state.conn(conn_id);
    if let Some(conn) = conn {
        if let Some(user_id) = conn.user_id {
            state.leave_online(&user_id, conn_id);
            state.broadcast_global("user:update", json!({ "users": state.users_payload() }));
        }
    }
    state.connections.lock().remove(&conn_id);
}

fn send(state: &AppState, conn_id: u64, payload: &Value) {
    if let Some(conn) = state.conn(conn_id) {
        conn.send_json(payload);
    }
}

fn send_server_error(state: &AppState, conn_id: u64, code: &str, message: &str) {
    send(
        state,
        conn_id,
        &json!({ "type": "server:error", "code": code, "message": message }),
    );
}

fn payload_string(value: &Value, key: &str) -> String {
    value
        .get(key)
        .map(value_to_string)
        .unwrap_or_default()
}

fn payload_bool(value: &Value, key: &str) -> bool {
    value.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn payload_u64(value: &Value, key: &str) -> Option<u64> {
    value.get(key).and_then(|item| {
        item.as_u64()
            .or_else(|| item.as_f64().filter(|number| *number > 0.0).map(|number| number as u64))
    })
}

fn new_message_id() -> String {
    format!("{}-{}", now_ms(), random_hex(4))
}

fn dm_key(a: &str, b: &str) -> String {
    let mut parts = [a.to_string(), b.to_string()];
    parts.sort();
    format!("{}|{}", parts[0], parts[1])
}

fn handle_message(state: &AppState, conn_id: u64, local: bool, ip: &str, msg: &Value) {
    let message_type = msg.get("type").and_then(Value::as_str).unwrap_or("");
    match message_type {
        "join" => handle_join(state, conn_id, local, msg),
        "join-server" => handle_join_server(state, conn_id, local, ip, msg),
        "server:leave" => handle_server_leave(state, conn_id),
        "server:message" => handle_server_message(state, conn_id, msg),
        "server:dm" => handle_server_dm(state, conn_id, msg),
        "server:dm:typing" => handle_server_dm_typing(state, conn_id, msg),
        "server:typing" => handle_server_typing(state, conn_id, msg),
        "voice:join" => handle_voice_join(state, conn_id, msg),
        "voice:leave" => handle_voice_leave(state, conn_id),
        "voice:update" => handle_voice_update(state, conn_id, msg),
        "voice:share" => handle_voice_share(state, conn_id, msg),
        "server:channel:create" => handle_channel_create(state, conn_id, msg),
        "server:channel:rename" => handle_channel_rename(state, conn_id, msg),
        "server:channel:duplicate" => handle_channel_duplicate(state, conn_id, msg),
        "server:channel:move" => handle_channel_move(state, conn_id, msg),
        "server:channel:delete" => handle_channel_delete(state, conn_id, msg),
        "server:profile" => handle_server_profile(state, conn_id, msg),
        "server:update" => handle_server_update(state, conn_id, msg),
        "server:activity" => handle_server_activity(state, conn_id, msg),
        "dm" => handle_dm(state, conn_id, local, msg),
        "dm:typing" => handle_dm_typing(state, conn_id, local, msg),
        "activity" => handle_activity(state, conn_id, local, msg),
        "status" => handle_status(state, conn_id, local, msg),
        "profile" => handle_profile(state, conn_id, local, msg),
        "users" => {
            if local {
                send(
                    state,
                    conn_id,
                    &json!({ "type": "users:list", "users": state.users_payload() }),
                );
            }
        }
        _ => {}
    }
}

fn handle_join(state: &AppState, conn_id: u64, local: bool, msg: &Value) {
    if !local {
        return;
    }
    let Some(conn) = state.conn(conn_id) else { return };
    let account = if state.cfg.public_web {
        conn.web_user_id
            .as_ref()
            .and_then(|id| state.find_user(id))
    } else {
        let user_id = payload_string(msg, "userId");
        state.find_user(&user_id)
    };
    let Some(account) = account else {
        send(
            state,
            conn_id,
            &json!({ "type": "auth-error", "message": "Sesja wygasła. Zaloguj się ponownie." }),
        );
        return;
    };

    state.revoke_voice_tokens(conn_id, "local");
    if let Some(previous) = conn.user_id.clone() {
        if previous != account.id {
            state.leave_online(&previous, conn_id);
        }
    }
    state.set_conn_user(conn_id, Some(account.id.clone()));

    let playing = msg
        .get("playing")
        .and_then(Value::as_str)
        .map(|text| take_chars(text.trim(), 40))
        .filter(|text| !text.is_empty());
    let playing_since = if playing.is_some() {
        payload_u64(msg, "playingSince")
            .or_else(|| payload_u64(msg, "since"))
            .or(Some(now_ms()))
    } else {
        None
    };
    let now = now_ms();
    let live = OnlineUser {
        name: account.display_name(),
        color: if account.color.is_empty() {
            user_color_for(&account.username)
        } else {
            account.color.clone()
        },
        handle: account.effective_handle(),
        status: "online".to_string(),
        playing: playing.clone(),
        playing_icon: playing
            .as_ref()
            .map(|_| sanitize_game_icon(&payload_string(msg, "playingIcon"))),
        playing_platform: playing
            .as_ref()
            .map(|_| sanitize_game_platform(&payload_string(msg, "playingPlatform"))),
        playing_since,
        since: now,
        last_seen: now,
    };
    state.set_online(&account.id, conn_id, live);

    let dm_history = {
        let chat = state.chat.read();
        let mut result = Map::new();
        for (key, list) in &chat.dms {
            let parts: Vec<&str> = key.split('|').collect();
            if parts.len() == 2 && (parts[0] == account.id || parts[1] == account.id) {
                let start = list.len().saturating_sub(300);
                result.insert(key.clone(), json!(list[start..]));
            }
        }
        result
    };
    let voice_key = state.issue_voice_token(conn_id, "local", &account.id);
    send(
        state,
        conn_id,
        &json!({
            "type": "joined",
            "userId": account.id,
            "users": state.users_payload(),
            "dmHistory": dm_history,
            "voiceKey": voice_key,
        }),
    );
    state.broadcast_global("user:update", json!({ "users": state.users_payload() }));
}

fn handle_join_server(state: &AppState, conn_id: u64, local: bool, ip: &str, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    if state.cfg.public_web && conn.web_user_id.is_none() {
        send(
            state,
            conn_id,
            &json!({ "type": "auth-error", "message": "Zaloguj się, aby dołączyć do serwera." }),
        );
        return;
    }
    if !state.cfg.public_web && !local {
        return;
    }
    if state.join_rate_limited(ip) {
        send_server_error(
            state,
            conn_id,
            "rate-limited",
            "Zbyt wiele prób. Spróbuj ponownie za chwilę.",
        );
        return;
    }
    let invite = payload_string(msg, "invite").trim().to_uppercase();
    let requested_id = payload_string(msg, "serverId");
    let server = {
        let store = state.servers.read();
        let mut found = None;
        if !requested_id.is_empty() {
            if let Some(candidate) = store.hosted.iter().find(|server| server.id == requested_id) {
                if candidate.invite == invite {
                    found = Some(candidate.clone());
                }
            }
        }
        found.or_else(|| {
            store
                .hosted
                .iter()
                .find(|server| server.invite == invite)
                .cloned()
        })
    };
    let Some(server) = server else {
        state.note_join_failure(ip);
        send_server_error(
            state,
            conn_id,
            "not-found",
            "Nie znaleziono serwera o tym kodzie zaproszenia.",
        );
        return;
    };
    if server.invite != invite {
        state.note_join_failure(ip);
        send_server_error(state, conn_id, "invalid-invite", "Nieprawidłowy kod zaproszenia.");
        return;
    }
    state.clear_join_failures(ip);

    state.detach_server(conn_id);
    let conn = state.conn(conn_id).unwrap_or(conn);
    let account = conn
        .web_user_id
        .as_ref()
        .and_then(|id| state.find_user(id));
    let profile = account.as_ref().map(Account::public_value);
    let owner = if state.cfg.public_web {
        account
            .as_ref()
            .map(|account| !server.owner_id.is_empty() && server.owner_id == account.id)
            .unwrap_or(false)
    } else {
        let key = payload_string(msg, "ownerKey");
        !key.is_empty() && key == server.owner_key
    };
    let mut member_id = if state.cfg.public_web {
        account.as_ref().map(|account| account.id.clone()).unwrap_or_default()
    } else {
        take_chars(
            &payload_string(msg, "memberId")
                .chars()
                .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
                .collect::<String>(),
            64,
        )
    };
    if member_id.is_empty() {
        member_id = random_uuid();
    }
    if !state.cfg.public_web {
        if owner {
            member_id = server.owner_id.clone();
        } else if member_id == server.owner_id {
            member_id = random_uuid();
        }
    }

    let name = if state.cfg.public_web {
        account
            .as_ref()
            .map(|account| account.display_name())
            .unwrap_or_else(|| "Gość".to_string())
    } else {
        let value = take_chars(payload_string(msg, "name").trim(), 32);
        if value.is_empty() {
            "Gość".to_string()
        } else {
            value
        }
    };
    let color = if state.cfg.public_web {
        account
            .as_ref()
            .map(|account| {
                if account.color.is_empty() {
                    "#3ee0a3".to_string()
                } else {
                    account.color.clone()
                }
            })
            .unwrap_or_else(|| "#3ee0a3".to_string())
    } else {
        let value = payload_string(msg, "color");
        if is_valid_hex(&value) {
            value.to_lowercase()
        } else {
            "#3ee0a3".to_string()
        }
    };
    let mut patch = profile_patch(msg);
    if state.cfg.public_web {
        if let Some(profile) = &profile {
            patch.insert("handle".to_string(), profile["handle"].clone());
            patch.insert("avatar".to_string(), profile["avatar"].clone());
            patch.insert("banner".to_string(), profile["banner"].clone());
            patch.insert("badges".to_string(), profile["badges"].clone());
            patch.insert("games".to_string(), profile["games"].clone());
            patch.insert("about".to_string(), profile["about"].clone());
        }
    }
    if patch
        .get("handle")
        .and_then(Value::as_str)
        .map(|value| value.is_empty())
        .unwrap_or(true)
    {
        patch.insert(
            "handle".to_string(),
            Value::String(handle_for_account(&member_id, &name, "")),
        );
    }

    let mut server = server;
    let member_index = server.members.iter().position(|member| member.id == member_id);
    if let Some(index) = member_index {
        let member = &mut server.members[index];
        member.name = name.clone();
        member.color = color.clone();
        member.owner = owner;
        member.last_seen = now_ms();
        apply_member_patch(member, &patch);
    } else {
        let mut member = ServerMember {
            id: member_id.clone(),
            name: name.clone(),
            color: color.clone(),
            owner,
            joined_at: now_ms(),
            last_seen: now_ms(),
            handle: patch
                .get("handle")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            avatar: patch
                .get("avatar")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            banner: patch.get("banner").cloned().unwrap_or(Value::Null),
            badges: patch
                .get("badges")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .map(value_to_string)
                        .filter(|value| !value.is_empty())
                        .collect()
                })
                .unwrap_or_else(|| vec!["piwo".to_string()]),
            games: patch
                .get("games")
                .map(sanitize_games)
                .unwrap_or_default(),
            about: patch
                .get("about")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            playing: patch
                .get("playing")
                .and_then(Value::as_str)
                .map(|value| value.to_string()),
            playing_icon: patch
                .get("playingIcon")
                .and_then(Value::as_str)
                .map(|value| value.to_string()),
            playing_platform: patch
                .get("playingPlatform")
                .and_then(Value::as_str)
                .map(|value| value.to_string()),
            playing_since: patch.get("playingSince").and_then(Value::as_u64),
        };
        if member.badges.is_empty() && patch.get("badges").is_none() {
            member.badges = vec!["piwo".to_string()];
        }
        server.members.push(member);
    }

    state.set_conn_server(
        conn_id,
        Some(ServerSession {
            server_id: server.id.clone(),
            member_id: member_id.clone(),
            name: name.clone(),
            color: color.clone(),
            owner,
        }),
    );
    let voice_key = state.issue_voice_token(conn_id, &format!("server:{}", server.id), &member_id);
    {
        let mut store = state.servers.write();
        if let Some(slot) = store.hosted.iter_mut().find(|item| item.id == server.id) {
            *slot = server.clone();
        }
    }
    state.save_servers();

    let mut messages = Map::new();
    for channel in &server.channels {
        let list = server.messages.get(&channel.id).cloned().unwrap_or_default();
        let start = list.len().saturating_sub(300);
        messages.insert(channel.id.clone(), json!(list[start..]));
    }
    let dms = state.server_dms_payload(&server, &member_id);
    let voice = state.voice_rooms_payload(&server.id);
    send(
        state,
        conn_id,
        &json!({
            "type": "server:joined",
            "server": server_info(&server),
            "members": state.server_members_payload(&server),
            "messages": messages,
            "dms": dms,
            "you": { "memberId": member_id, "owner": owner },
            "voice": voice,
            "voiceKey": voice_key,
        }),
    );
    state.broadcast_server_members(&server);
}

fn apply_member_patch(member: &mut ServerMember, patch: &Map<String, Value>) {
    if let Some(value) = patch.get("handle").and_then(Value::as_str) {
        member.handle = value.to_string();
    }
    if let Some(value) = patch.get("avatar").and_then(Value::as_str) {
        member.avatar = value.to_string();
    }
    if let Some(value) = patch.get("banner") {
        member.banner = value.clone();
    }
    if let Some(value) = patch.get("badges").and_then(Value::as_array) {
        member.badges = value
            .iter()
            .map(value_to_string)
            .filter(|value| !value.is_empty())
            .collect();
    }
    if let Some(value) = patch.get("games") {
        member.games = sanitize_games(value);
    }
    if let Some(value) = patch.get("about").and_then(Value::as_str) {
        member.about = value.to_string();
    }
    if let Some(value) = patch.get("playing") {
        member.playing = value.as_str().map(|value| value.to_string());
    }
    if let Some(value) = patch.get("playingIcon") {
        member.playing_icon = value.as_str().map(|value| value.to_string());
    }
    if let Some(value) = patch.get("playingPlatform") {
        member.playing_platform = value.as_str().map(|value| value.to_string());
    }
    if let Some(value) = patch.get("playingSince") {
        member.playing_since = value.as_u64();
    }
}

pub fn server_info(server: &Server) -> Value {
    json!({
        "id": server.id,
        "name": server.name,
        "icon": server.icon,
        "color": server.color,
        "tag": server.tag,
        "banner": sanitize_server_banner(&Value::String(server.banner.clone())),
        "description": sanitize_server_description(&server.description),
        "traits": sanitize_server_text_list(&json!(server.traits), SERVER_TRAIT_LIMIT, SERVER_TRAIT_LENGTH),
        "games": sanitize_server_text_list(&json!(server.games), SERVER_GAME_LIMIT, SERVER_GAME_LENGTH),
        "invite": server.invite,
        "ownerId": server.owner_id,
        "createdAt": server.created_at,
        "channels": server.channels.iter().map(|channel| json!({
            "id": channel.id,
            "name": channel.name,
            "type": channel.channel_type,
            "createdAt": channel.created_at,
        })).collect::<Vec<Value>>(),
    })
}

fn handle_server_leave(state: &AppState, conn_id: u64) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let mut updated = None;
    {
        let mut store = state.servers.write();
        if let Some(server) = store.hosted.iter_mut().find(|server| server.id == session.server_id) {
            let before = server.members.len();
            server.members.retain(|member| member.id != session.member_id);
            if server.members.len() != before {
                updated = Some(server.clone());
            }
        }
    }
    if updated.is_some() {
        state.save_servers();
    }
    if let Some(server) = updated {
        state.broadcast_server_members(&server);
    }
    state.detach_server(conn_id);
}

fn handle_server_message(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let channel_id = payload_string(msg, "channelId");
    let text = take_chars(payload_string(msg, "text").trim(), 4000);
    if text.is_empty() {
        return;
    }
    let mut dropped = None;
    let mut server_id = String::new();
    {
        let mut store = state.servers.write();
        let Some(server) = store.hosted.iter_mut().find(|server| server.id == session.server_id) else {
            return;
        };
        let Some(channel) = server.channels.iter().find(|channel| channel.id == channel_id) else {
            return;
        };
        if channel.channel_type == "voice" {
            drop(store);
            send_server_error(
                state,
                conn_id,
                "voice-channel",
                "Kanały głosowe nie obsługują wiadomości tekstowych.",
            );
            return;
        }
        let message = Message {
            id: new_message_id(),
            channel_id: Some(channel.id.clone()),
            author_id: session.member_id.clone(),
            author_name: session.name.clone(),
            author_color: session.color.clone(),
            to: None,
            text,
            at: now_ms(),
        };
        let list = server.messages.entry(channel.id.clone()).or_default();
        list.push(message.clone());
        if list.len() > 300 {
            dropped = list.first().cloned();
            list.remove(0);
        }
        server_id = server.id.clone();
        let payload = json!({ "type": "server:message", "message": message });
        drop(store);
        state.save_servers();
        state.broadcast_server(&server_id, payload, None);
    }
    if let Some(message) = dropped {
        state.remove_voice_from_messages(&[message]);
    }
}

fn handle_server_dm(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let to = payload_string(msg, "to");
    let text = take_chars(payload_string(msg, "text").trim(), 4000);
    if to.is_empty() || text.is_empty() || to == session.member_id {
        return;
    }
    let mut dropped = None;
    let mut payload = Value::Null;
    {
        let mut store = state.servers.write();
        let Some(server) = store.hosted.iter_mut().find(|server| server.id == session.server_id) else {
            return;
        };
        if !server.members.iter().any(|member| member.id == to) {
            drop(store);
            send_server_error(
                state,
                conn_id,
                "dm-target",
                "Ta osoba nie jest już członkiem serwera.",
            );
            return;
        }
        let message = Message {
            id: new_message_id(),
            channel_id: None,
            author_id: session.member_id.clone(),
            author_name: session.name.clone(),
            author_color: session.color.clone(),
            to: Some(to.clone()),
            text,
            at: now_ms(),
        };
        let key = dm_key(&session.member_id, &to);
        let list = server.dms.entry(key).or_default();
        list.push(message.clone());
        if list.len() > 500 {
            dropped = list.first().cloned();
            list.remove(0);
        }
        payload = json!({
            "type": "server:dm",
            "serverId": server.id,
            "message": message,
        });
        drop(store);
        state.save_servers();
    }
    send(state, conn_id, &payload);
    let server_id = payload
        .get("serverId")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    for target in state.conns() {
        if target.id == conn_id {
            continue;
        }
        let matches = target
            .server
            .as_ref()
            .map(|other| other.server_id == server_id && other.member_id == to)
            .unwrap_or(false);
        if matches {
            target.send_json(&payload);
        }
    }
    if let Some(message) = dropped {
        state.remove_voice_from_messages(&[message]);
    }
}

fn session_server_id(payload: &Value) -> String {
    payload
        .get("serverId")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

fn handle_server_dm_typing(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let to = payload_string(msg, "to");
    if to.is_empty() || to == session.member_id {
        return;
    }
    let payload = json!({
        "type": "server:dm:typing",
        "serverId": session.server_id,
        "from": session.member_id,
        "name": session.name,
        "typing": payload_bool(msg, "typing"),
    });
    for target in state.conns() {
        if target
            .server
            .as_ref()
            .map(|other| other.server_id == session.server_id && other.member_id == to)
            .unwrap_or(false)
        {
            target.send_json(&payload);
        }
    }
}

fn handle_server_typing(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let channel_id = payload_string(msg, "channelId");
    let Some(server) = state.find_hosted(&session.server_id) else { return };
    let Some(channel) = server.channels.iter().find(|channel| channel.id == channel_id) else {
        return;
    };
    if channel.channel_type == "voice" {
        return;
    }
    state.broadcast_server(
        &session.server_id,
        json!({
            "type": "server:typing",
            "channelId": channel.id,
            "userId": session.member_id,
            "name": session.name,
            "typing": payload_bool(msg, "typing"),
        }),
        Some(conn_id),
    );
}

fn handle_voice_join(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let channel_id = payload_string(msg, "channelId");
    let Some(server) = state.find_hosted(&session.server_id) else { return };
    let Some(channel) = server.channels.iter().find(|channel| channel.id == channel_id) else {
        send_server_error(
            state,
            conn_id,
            "voice-channel",
            "Ten kanał nie jest kanałem głosowym.",
        );
        return;
    };
    if channel.channel_type != "voice" {
        send_server_error(
            state,
            conn_id,
            "voice-channel",
            "Ten kanał nie jest kanałem głosowym.",
        );
        return;
    }
    if let Some(existing) = conn.voice_channel.clone() {
        if existing != channel_id {
            state.leave_voice(conn_id);
        }
    }
    let previous_conn;
    {
        let mut rooms = state.voice_rooms.lock();
        let server_rooms = rooms.entry(server.id.clone()).or_default();
        let room = server_rooms.entry(channel_id.clone()).or_default();
        previous_conn = room
            .get(&session.member_id)
            .map(|participant| participant.conn_id)
            .filter(|id| *id != conn_id);
        room.insert(
            session.member_id.clone(),
            VoiceParticipant {
                member_id: session.member_id.clone(),
                name: session.name.clone(),
                color: session.color.clone(),
                muted: payload_bool(msg, "muted"),
                deafened: payload_bool(msg, "deafened"),
                sharing: false,
                share_name: String::new(),
                conn_id,
            },
        );
    }
    if let Some(previous) = previous_conn {
        state.set_conn_voice_channel(previous, None);
    }
    state.set_conn_voice_channel(conn_id, Some(channel_id.clone()));
    send(
        state,
        conn_id,
        &json!({
            "type": "voice:joined",
            "serverId": server.id,
            "channelId": channel_id,
            "participants": state.voice_participants(&server.id, &channel_id),
        }),
    );
    state.broadcast_voice_channel(&server.id, &channel_id);
}

fn handle_voice_leave(state: &AppState, conn_id: u64) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    if let Some((_, channel_id)) = state.leave_voice(conn_id) {
        send(
            state,
            conn_id,
            &json!({
                "type": "voice:left",
                "serverId": session.server_id,
                "channelId": channel_id,
            }),
        );
    }
}

fn handle_voice_update(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let Some(channel_id) = conn.voice_channel.clone() else {
        return;
    };
    let mut found = false;
    {
        let mut rooms = state.voice_rooms.lock();
        if let Some(room) = rooms
            .get_mut(&session.server_id)
            .and_then(|server_rooms| server_rooms.get_mut(&channel_id))
        {
            if let Some(participant) = room.get_mut(&session.member_id) {
                if participant.conn_id == conn_id {
                    if let Some(value) = msg.get("muted").and_then(Value::as_bool) {
                        participant.muted = value;
                    }
                    if let Some(value) = msg.get("deafened").and_then(Value::as_bool) {
                        participant.deafened = value;
                    }
                    found = true;
                }
            }
        }
    }
    if found {
        state.broadcast_voice_channel(&session.server_id, &channel_id);
    }
}

fn handle_voice_share(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let Some(channel_id) = conn.voice_channel.clone() else {
        return;
    };
    let sharing = payload_bool(msg, "sharing");
    let mut denied = false;
    {
        let mut rooms = state.voice_rooms.lock();
        if let Some(room) = rooms
            .get_mut(&session.server_id)
            .and_then(|server_rooms| server_rooms.get_mut(&channel_id))
        {
            let Some(participant) = room.get(&session.member_id).cloned() else {
                return;
            };
            if participant.conn_id != conn_id {
                return;
            }
            if sharing
                && room
                    .values()
                    .any(|other| other.conn_id != conn_id && other.sharing)
            {
                denied = true;
            } else if let Some(participant) = room.get_mut(&session.member_id) {
                participant.sharing = sharing;
                participant.share_name = if sharing {
                    take_chars(payload_string(msg, "name").trim(), 80)
                } else {
                    String::new()
                };
            }
        }
    }
    if denied {
        send(
            state,
            conn_id,
            &json!({
                "type": "voice:share-denied",
                "serverId": session.server_id,
                "channelId": channel_id,
                "code": "busy",
                "message": "Ktoś już udostępnia ekran na tym kanale.",
            }),
        );
        return;
    }
    state.broadcast_voice_channel(&session.server_id, &channel_id);
}

fn owner_context(state: &AppState, conn_id: u64) -> Option<(ServerSession, Server)> {
    let conn = state.conn(conn_id)?;
    let session = conn.server.clone()?;
    let server = state.find_hosted(&session.server_id)?;
    if !session.owner || server.owner_id != session.member_id {
        send_server_error(
            state,
            conn_id,
            "forbidden",
            "Tylko właściciel serwera może zarządzać kanałami.",
        );
        return None;
    }
    Some((session, server))
}

fn handle_channel_create(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let Some(server) = state.find_hosted(&session.server_id) else { return };
    if !session.owner || server.owner_id != session.member_id {
        send_server_error(
            state,
            conn_id,
            "forbidden",
            "Tylko właściciel serwera może tworzyć kanały.",
        );
        return;
    }
    let name = sanitize_channel_name(&payload_string(msg, "name"));
    if name.is_empty() {
        send_server_error(
            state,
            conn_id,
            "invalid-channel",
            "Podaj poprawną nazwę kanału.",
        );
        return;
    }
    if server
        .channels
        .iter()
        .any(|channel| channel.name.to_lowercase() == name.to_lowercase())
    {
        send_server_error(
            state,
            conn_id,
            "channel-exists",
            "Kanał o tej nazwie już istnieje.",
        );
        return;
    }
    let channel = Channel {
        id: make_channel_id(),
        name,
        channel_type: if payload_string(msg, "channelType") == "voice" {
            "voice".to_string()
        } else {
            "text".to_string()
        },
        created_at: now_ms(),
    };
    let mut updated = None;
    {
        let mut store = state.servers.write();
        if let Some(server) = store.hosted.iter_mut().find(|item| item.id == session.server_id) {
            server.channels.push(channel.clone());
            if channel.channel_type == "text" {
                server.messages.insert(channel.id.clone(), Vec::new());
            }
            updated = Some(server.clone());
        }
    }
    let Some(server) = updated else { return };
    state.save_servers();
    state.broadcast_server(
        &server.id,
        json!({ "type": "server:channels", "channels": channels_payload(&server) }),
        None,
    );
    send(
        state,
        conn_id,
        &json!({ "type": "server:channel:created", "channel": channel_payload(&channel) }),
    );
}

fn channels_payload(server: &Server) -> Vec<Value> {
    server
        .channels
        .iter()
        .map(channel_payload)
        .collect()
}

fn channel_payload(channel: &Channel) -> Value {
    json!({
        "id": channel.id,
        "name": channel.name,
        "type": channel.channel_type,
        "createdAt": channel.created_at,
    })
}

fn copy_channel_name(server: &Server, source_name: &str) -> String {
    let base = take_chars(&format!("{}-kopia", source_name), 32);
    let mut name = base.clone();
    let mut counter = 2;
    while server
        .channels
        .iter()
        .any(|channel| channel.name.to_lowercase() == name.to_lowercase())
    {
        let suffix = format!("-{}", counter);
        let keep = 32usize.saturating_sub(suffix.chars().count());
        name = format!("{}{}", take_chars(&base, keep.max(1)), suffix);
        counter += 1;
    }
    name
}

fn handle_channel_rename(state: &AppState, conn_id: u64, msg: &Value) {
    let Some((session, _)) = owner_context(state, conn_id) else {
        return;
    };
    let channel_id = payload_string(msg, "channelId");
    let name = sanitize_channel_name(&payload_string(msg, "name"));
    if name.is_empty() {
        send_server_error(
            state,
            conn_id,
            "invalid-channel",
            "Podaj poprawną nazwę kanału.",
        );
        return;
    }
    let mut updated = None;
    let mut channel_value = Value::Null;
    {
        let mut store = state.servers.write();
        let Some(server) = store.hosted.iter_mut().find(|item| item.id == session.server_id) else {
            return;
        };
        if !server.channels.iter().any(|channel| channel.id == channel_id) {
            drop(store);
            send_server_error(state, conn_id, "invalid-channel", "Nie znaleziono kanału.");
            return;
        }
        if server
            .channels
            .iter()
            .any(|channel| channel.id != channel_id && channel.name.to_lowercase() == name.to_lowercase())
        {
            drop(store);
            send_server_error(
                state,
                conn_id,
                "channel-exists",
                "Kanał o tej nazwie już istnieje.",
            );
            return;
        }
        if let Some(channel) = server.channels.iter_mut().find(|channel| channel.id == channel_id) {
            channel.name = name;
            channel_value = channel_payload(channel);
        }
        updated = Some(server.clone());
    }
    let Some(server) = updated else { return };
    state.save_servers();
    state.broadcast_server(
        &server.id,
        json!({ "type": "server:channels", "channels": channels_payload(&server) }),
        None,
    );
    state.broadcast_server(
        &server.id,
        json!({
            "type": "server:channel:renamed",
            "channel": channel_value,
            "actorId": session.member_id,
        }),
        None,
    );
}

fn handle_channel_duplicate(state: &AppState, conn_id: u64, msg: &Value) {
    let Some((session, _)) = owner_context(state, conn_id) else {
        return;
    };
    let channel_id = payload_string(msg, "channelId");
    let mut updated = None;
    let mut duplicated_channel = Value::Null;
    let mut duplicated_messages: Vec<Message> = Vec::new();
    {
        let mut store = state.servers.write();
        let Some(server) = store.hosted.iter_mut().find(|item| item.id == session.server_id) else {
            return;
        };
        let Some(source_index) = server.channels.iter().position(|channel| channel.id == channel_id) else {
            drop(store);
            send_server_error(state, conn_id, "invalid-channel", "Nie znaleziono kanału.");
            return;
        };
        let source = server.channels[source_index].clone();
        let mut id = make_channel_id();
        while server.channels.iter().any(|channel| channel.id == id) {
            id = make_channel_id();
        }
        let channel = Channel {
            id: id.clone(),
            name: copy_channel_name(server, &source.name),
            channel_type: source.channel_type.clone(),
            created_at: now_ms(),
        };
        if source.channel_type == "text" {
            let source_messages = server.messages.get(&source.id).cloned().unwrap_or_default();
            let start = source_messages.len().saturating_sub(300);
            duplicated_messages = source_messages[start..]
                .iter()
                .map(|message| Message {
                    id: new_message_id(),
                    channel_id: Some(channel.id.clone()),
                    ..message.clone()
                })
                .collect();
        }
        server.channels.insert(source_index + 1, channel.clone());
        if channel.channel_type == "text" {
            server
                .messages
                .insert(channel.id.clone(), duplicated_messages.clone());
        }
        duplicated_channel = channel_payload(&channel);
        updated = Some(server.clone());
    }
    let Some(server) = updated else { return };
    state.save_servers();
    state.broadcast_server(
        &server.id,
        json!({ "type": "server:channels", "channels": channels_payload(&server) }),
        None,
    );
    state.broadcast_server(
        &server.id,
        json!({
            "type": "server:channel:duplicated",
            "channel": duplicated_channel,
            "messages": duplicated_messages,
            "actorId": session.member_id,
        }),
        None,
    );
}

fn handle_channel_move(state: &AppState, conn_id: u64, msg: &Value) {
    let Some((session, _)) = owner_context(state, conn_id) else {
        return;
    };
    let channel_id = payload_string(msg, "channelId");
    let target_id = payload_string(msg, "targetId");
    let mut updated = None;
    let mut moved = Value::Null;
    {
        let mut store = state.servers.write();
        let Some(server) = store.hosted.iter_mut().find(|item| item.id == session.server_id) else {
            return;
        };
        let Some(from) = server.channels.iter().position(|channel| channel.id == channel_id) else {
            drop(store);
            send_server_error(state, conn_id, "invalid-channel", "Nie znaleziono kanału.");
            return;
        };
        if !target_id.is_empty() && target_id == channel_id {
            return;
        }
        let target_index = if !target_id.is_empty() && target_id != "__end__" {
            match server.channels.iter().position(|channel| channel.id == target_id) {
                Some(index) => index as i64,
                None => {
                    drop(store);
                    send_server_error(
                        state,
                        conn_id,
                        "invalid-channel",
                        "Nie znaleziono kanału docelowego.",
                    );
                    return;
                }
            }
        } else {
            -1
        };
        let channel = server.channels.remove(from);
        let mut to = server.channels.len();
        if target_index >= 0 {
            to = server
                .channels
                .iter()
                .position(|item| item.id == target_id)
                .unwrap_or(server.channels.len());
        }
        moved = channel_payload(&channel);
        server.channels.insert(to, channel);
        updated = Some(server.clone());
    }
    let Some(server) = updated else { return };
    state.save_servers();
    state.broadcast_server(
        &server.id,
        json!({ "type": "server:channels", "channels": channels_payload(&server) }),
        None,
    );
    state.broadcast_server(
        &server.id,
        json!({
            "type": "server:channel:moved",
            "channelId": moved["id"],
            "name": moved["name"],
            "actorId": session.member_id,
        }),
        None,
    );
}

fn handle_channel_delete(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let Some(server) = state.find_hosted(&session.server_id) else { return };
    if !session.owner || server.owner_id != session.member_id {
        send_server_error(
            state,
            conn_id,
            "forbidden",
            "Tylko właściciel serwera może usuwać kanały.",
        );
        return;
    }
    let channel_id = payload_string(msg, "channelId");
    let mut removed_messages = Vec::new();
    let mut updated = None;
    let mut removed_channel = None;
    {
        let mut store = state.servers.write();
        let Some(server) = store.hosted.iter_mut().find(|item| item.id == session.server_id) else {
            return;
        };
        let Some(index) = server.channels.iter().position(|channel| channel.id == channel_id) else {
            drop(store);
            send_server_error(state, conn_id, "invalid-channel", "Nie znaleziono kanału.");
            return;
        };
        removed_channel = Some(server.channels.remove(index));
        removed_messages = server.messages.remove(&channel_id).unwrap_or_default();
        updated = Some(server.clone());
    }
    let Some(server) = updated else { return };
    let Some(channel) = removed_channel else { return };
    state.remove_voice_channel(&server.id, &channel_id);
    state.save_servers();
    state.remove_voice_from_messages(&removed_messages);
    state.broadcast_server(
        &server.id,
        json!({
            "type": "server:channel:deleted",
            "channelId": channel.id,
            "name": channel.name,
            "actorId": session.member_id,
        }),
        None,
    );
    state.broadcast_server(
        &server.id,
        json!({ "type": "server:channels", "channels": channels_payload(&server) }),
        None,
    );
}

fn handle_server_profile(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let patch = profile_patch(msg);
    let mut updated = None;
    let mut new_name = session.name.clone();
    let mut new_color = session.color.clone();
    {
        let mut store = state.servers.write();
        let Some(server) = store.hosted.iter_mut().find(|item| item.id == session.server_id) else {
            return;
        };
        let Some(member) = server.members.iter_mut().find(|member| member.id == session.member_id) else {
            return;
        };
        if let Some(value) = msg.get("name").and_then(Value::as_str) {
            let name = take_chars(value.trim(), 32);
            if !name.is_empty() {
                member.name = name.clone();
                new_name = name;
            }
        }
        if let Some(value) = msg.get("color").and_then(Value::as_str) {
            if is_valid_hex(value) {
                member.color = value.to_lowercase();
                new_color = member.color.clone();
            }
        }
        apply_member_patch(member, &patch);
        member.last_seen = now_ms();
        updated = Some(server.clone());
    }
    let Some(server) = updated else { return };
    state.set_conn_server(
        conn_id,
        Some(ServerSession {
            name: new_name.clone(),
            color: new_color.clone(),
            ..session.clone()
        }),
    );
    state.save_servers();
    state.broadcast_server_members(&server);
    if let Some(channel_id) = conn.voice_channel.clone() {
        let mut found = false;
        {
            let mut rooms = state.voice_rooms.lock();
            if let Some(room) = rooms
                .get_mut(&server.id)
                .and_then(|server_rooms| server_rooms.get_mut(&channel_id))
            {
                if let Some(participant) = room.get_mut(&session.member_id) {
                    participant.name = new_name;
                    participant.color = new_color;
                    found = true;
                }
            }
        }
        if found {
            state.broadcast_voice_channel(&server.id, &channel_id);
        }
    }
}

fn handle_server_update(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let Some(server) = state.find_hosted(&session.server_id) else { return };
    if !session.owner || server.owner_id != session.member_id {
        send_server_error(
            state,
            conn_id,
            "forbidden",
            "Tylko właściciel serwera może edytować ustawienia serwera.",
        );
        return;
    }
    let name = payload_string(msg, "name").trim().to_string();
    if name.chars().count() < 2 || name.chars().count() > 40 {
        send_server_error(
            state,
            conn_id,
            "invalid-name",
            "Nazwa serwera musi mieć 2–40 znaków.",
        );
        return;
    }
    let mut updated = None;
    {
        let mut store = state.servers.write();
        let Some(server) = store.hosted.iter_mut().find(|item| item.id == session.server_id) else {
            return;
        };
        server.name = name;
        if let Some(value) = msg.get("icon").and_then(Value::as_str) {
            server.icon = take_chars(value.trim(), 4);
        }
        if let Some(value) = msg.get("color").and_then(Value::as_str) {
            if is_valid_hex(value) {
                server.color = value.to_lowercase();
            }
        }
        server.tag = take_chars(
            &payload_string(msg, "tag")
                .to_uppercase()
                .chars()
                .filter(|c| c.is_ascii_alphanumeric())
                .collect::<String>(),
            8,
        );
        if let Some(value) = msg.get("banner") {
            server.banner = sanitize_server_banner(value);
        }
        if let Some(value) = msg.get("description") {
            server.description = sanitize_server_description(&value_to_string(value));
        }
        if let Some(value) = msg.get("traits") {
            server.traits =
                sanitize_server_text_list(value, SERVER_TRAIT_LIMIT, SERVER_TRAIT_LENGTH);
        }
        if let Some(value) = msg.get("games") {
            server.games =
                sanitize_server_text_list(value, SERVER_GAME_LIMIT, SERVER_GAME_LENGTH);
        }
        updated = Some(server.clone());
    }
    let Some(server) = updated else { return };
    state.save_servers();
    state.broadcast_server(
        &server.id,
        json!({ "type": "server:info", "server": server_info(&server), "actorId": session.member_id }),
        None,
    );
}

fn handle_server_activity(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let patch = profile_patch(msg);
    let mut updated = None;
    {
        let mut store = state.servers.write();
        let Some(server) = store.hosted.iter_mut().find(|item| item.id == session.server_id) else {
            return;
        };
        let Some(member) = server.members.iter_mut().find(|member| member.id == session.member_id) else {
            return;
        };
        member.playing = patch
            .get("playing")
            .and_then(Value::as_str)
            .map(|value| value.to_string());
        member.playing_icon = patch
            .get("playingIcon")
            .and_then(Value::as_str)
            .map(|value| value.to_string());
        member.playing_platform = patch
            .get("playingPlatform")
            .and_then(Value::as_str)
            .map(|value| value.to_string());
        member.playing_since = patch.get("playingSince").and_then(Value::as_u64);
        member.last_seen = now_ms();
        updated = Some(server.clone());
    }
    let Some(server) = updated else { return };
    state.save_servers();
    state.broadcast_server_members(&server);
}

fn handle_dm(state: &AppState, conn_id: u64, local: bool, msg: &Value) {
    if !local {
        return;
    }
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(user_id) = conn.user_id.clone() else { return };
    let to = payload_string(msg, "to");
    let text = payload_string(msg, "text");
    if to.is_empty() || text.is_empty() {
        return;
    }
    if state.find_user(&to).is_none() {
        return;
    }
    let Some(user) = state.online.read().get(&user_id).cloned() else {
        return;
    };
    let message = Message {
        id: new_message_id(),
        channel_id: None,
        author_id: user_id.clone(),
        author_name: user.name,
        author_color: user.color,
        to: Some(to.clone()),
        text: take_chars(&text, 4000),
        at: now_ms(),
    };
    let key = dm_key(&user_id, &to);
    let mut dropped = None;
    {
        let mut chat = state.chat.write();
        let list = chat.dms.entry(key).or_default();
        list.push(message.clone());
        if list.len() > 500 {
            dropped = list.first().cloned();
            list.remove(0);
        }
    }
    state.save_chat();
    if let Some(message) = dropped {
        state.remove_voice_from_messages(&[message]);
    }
    let payload = json!({ "type": "dm", "message": message });
    send(state, conn_id, &payload);
    if to != user_id {
        let target_conn = state.user_conns.lock().get(&to).copied();
        if let Some(target) = target_conn.and_then(|id| state.conn(id)) {
            target.send_json(&payload);
        }
    }
}

fn handle_dm_typing(state: &AppState, conn_id: u64, local: bool, msg: &Value) {
    if !local {
        return;
    }
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(user_id) = conn.user_id.clone() else { return };
    let to = payload_string(msg, "to");
    if to.is_empty() {
        return;
    }
    let Some(user) = state.online.read().get(&user_id).cloned() else {
        return;
    };
    let target_conn = state.user_conns.lock().get(&to).copied();
    if let Some(target) = target_conn.and_then(|id| state.conn(id)) {
        target.send_json(&json!({
            "type": "dm:typing",
            "userId": user_id,
            "name": user.name,
            "typing": payload_bool(msg, "typing"),
        }));
    }
}

fn handle_activity(state: &AppState, conn_id: u64, local: bool, msg: &Value) {
    if !local {
        return;
    }
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(user_id) = conn.user_id.clone() else { return };
    let title = msg
        .get("playing")
        .and_then(Value::as_str)
        .map(|value| take_chars(value.trim(), 40))
        .unwrap_or_default();
    let now = now_ms();
    let since = payload_u64(msg, "playingSince")
        .or_else(|| payload_u64(msg, "since"))
        .filter(|value| *value > 0)
        .unwrap_or(now);
    state.update_online(&user_id, |user| {
        user.playing = if title.is_empty() {
            None
        } else {
            Some(title.clone())
        };
        user.playing_icon = if title.is_empty() {
            None
        } else {
            Some(sanitize_game_icon(&payload_string(msg, "playingIcon")))
        };
        user.playing_platform = if title.is_empty() {
            None
        } else {
            Some(sanitize_game_platform(&payload_string(msg, "playingPlatform")))
        };
        user.playing_since = if title.is_empty() { None } else { Some(since) };
        user.last_seen = now;
    });
    state.broadcast_global("user:update", json!({ "users": state.users_payload() }));
}

fn handle_status(state: &AppState, conn_id: u64, local: bool, msg: &Value) {
    if !local {
        return;
    }
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(user_id) = conn.user_id.clone() else { return };
    let status = payload_string(msg, "status");
    let status = if ["online", "away", "dnd", "invisible"].contains(&status.as_str()) {
        status
    } else {
        "online".to_string()
    };
    state.update_online(&user_id, |user| {
        user.status = status;
        user.last_seen = now_ms();
    });
    state.broadcast_global("user:update", json!({ "users": state.users_payload() }));
}

fn handle_profile(state: &AppState, conn_id: u64, local: bool, msg: &Value) {
    if !local {
        return;
    }
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(user_id) = conn.user_id.clone() else { return };
    let Some(account) = state.find_user(&user_id) else { return };
    let patch = profile_patch(msg);
    {
        let mut store = state.accounts.write();
        let Some(user) = store.users.iter_mut().find(|user| user.id == user_id) else {
            return;
        };
        if let Some(value) = msg.get("displayName").and_then(Value::as_str) {
            let value = take_chars(value.trim(), 32);
            if !value.is_empty() {
                user.display_name = value;
            }
        }
        if let Some(value) = msg.get("color").and_then(Value::as_str) {
            if is_valid_hex(value) {
                user.color = value.to_lowercase();
            }
        }
        if let Some(value) = msg.get("about").and_then(Value::as_str) {
            user.about = take_chars(value, 160);
        }
        if let Some(value) = patch.get("handle").and_then(Value::as_str) {
            user.handle = value.to_string();
        }
        if let Some(value) = patch.get("avatar").and_then(Value::as_str) {
            user.avatar = value.to_string();
        }
        if let Some(value) = patch.get("banner") {
            user.banner = value.clone();
        }
        if let Some(value) = patch.get("badges").and_then(Value::as_array) {
            user.badges = value
                .iter()
                .map(value_to_string)
                .filter(|value| !value.is_empty())
                .collect();
        }
        if let Some(value) = patch.get("games") {
            user.games = sanitize_games(value);
        }
    }
    state.save_accounts();
    let updated = state.find_user(&account.id).unwrap_or(account);
    state.update_online(&user_id, |live| {
        live.name = updated.display_name();
        live.color = if updated.color.is_empty() {
            user_color_for(&updated.username)
        } else {
            updated.color.clone()
        };
        live.handle = updated.effective_handle();
    });
    state.broadcast_global("user:update", json!({ "users": state.users_payload() }));
    send(
        state,
        conn_id,
        &json!({ "type": "profile:updated", "user": updated.public_value() }),
    );
}

fn relay_voice_frame(state: &AppState, conn_id: u64, raw: &[u8]) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let Some(channel_id) = conn.voice_channel.clone() else {
        return;
    };
    if raw.len() < 2 {
        return;
    }
    let participant = {
        let rooms = state.voice_rooms.lock();
        rooms
            .get(&session.server_id)
            .and_then(|server_rooms| server_rooms.get(&channel_id))
            .and_then(|room| room.get(&session.member_id))
            .cloned()
    };
    let Some(participant) = participant else { return };
    if participant.conn_id != conn_id {
        return;
    }
    let screen_frame = raw.len() > SCREEN_FRAME_MAGIC.len() && raw[..4] == SCREEN_FRAME_MAGIC;
    let (kind, payload): (u8, &[u8]) = if screen_frame {
        if !participant.sharing || raw.len() > SCREEN_FRAME_MAX {
            return;
        }
        (2, &raw[4..])
    } else {
        if participant.muted || raw.len() > VOICE_FRAME_MAX {
            return;
        }
        (1, raw)
    };
    let member_bytes = session.member_id.as_bytes();
    if member_bytes.is_empty() || member_bytes.len() > 255 {
        return;
    }
    let mut packet = Vec::with_capacity(2 + member_bytes.len() + payload.len());
    packet.push(kind);
    packet.push(member_bytes.len() as u8);
    packet.extend_from_slice(member_bytes);
    packet.extend_from_slice(payload);

    for target in state.conns() {
        if target.id == conn_id {
            continue;
        }
        if target.voice_channel.as_deref() != Some(channel_id.as_str()) {
            continue;
        }
        let Some(target_session) = &target.server else { continue };
        if target_session.server_id != session.server_id {
            continue;
        }
        target.send_binary(packet.clone());
    }
}
