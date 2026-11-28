use std::collections::HashSet;
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

fn payload_client_id(value: &Value) -> Option<String> {
    let id = payload_string(value, "clientId");
    if id.is_empty() {
        None
    } else {
        Some(take_chars(&id, 80))
    }
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

fn sanitize_reaction_emoji(value: &str) -> Option<String> {
    let cleaned: String = value
        .chars()
        .filter(|character| !character.is_control() && !character.is_whitespace())
        .take(16)
        .collect();
    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned)
    }
}

fn toggle_reaction(message: &mut Message, user_id: &str, emoji: &str) {
    let mut remove = false;
    if let Some(users) = message.reactions.get_mut(emoji) {
        if let Some(index) = users.iter().position(|id| id == user_id) {
            users.remove(index);
        } else {
            users.push(user_id.to_string());
        }
        remove = users.is_empty();
    } else if message.reactions.len() < 16 {
        message.reactions.insert(emoji.to_string(), vec![user_id.to_string()]);
    }
    if remove {
        message.reactions.remove(emoji);
    }
}

fn reply_preview(message: &Message) -> ReplyPreview {
    ReplyPreview {
        id: message.id.clone(),
        author_id: message.author_id.clone(),
        author_name: message.author_name.clone(),
        author_color: message.author_color.clone(),
        text: take_chars(message.text.trim(), 120),
    }
}

fn reply_target(list: &[Message], reply_to_id: &str, reply_to_client_id: &str) -> Option<ReplyPreview> {
    if reply_to_id.is_empty() && reply_to_client_id.is_empty() {
        return None;
    }
    list.iter()
        .find(|message| {
            (!reply_to_id.is_empty() && message.id == reply_to_id)
                || (!reply_to_client_id.is_empty()
                    && message.client_id.as_deref() == Some(reply_to_client_id))
        })
        .map(reply_preview)
}

fn message_index(list: &[Message], message_id: &str, client_id: &str) -> Option<usize> {
    list.iter()
        .position(|message| message.id == message_id)
        .or_else(|| {
            if client_id.is_empty() {
                None
            } else {
                list.iter()
                    .position(|message| message.client_id.as_deref() == Some(client_id))
            }
        })
}

fn trim_messages(list: &mut Vec<Message>, limit: usize) -> Option<Message> {
    if list.len() <= limit {
        return None;
    }
    // Pinned messages are small in number (the pin limit is 100) and are the
    // most valuable part of the history, so drop the oldest unpinned entry.
    let index = list
        .iter()
        .position(|message| message.pinned_at.is_none())
        .unwrap_or(0);
    Some(list.remove(index))
}

fn recent_messages_with_pins(list: &[Message], limit: usize) -> Vec<Message> {
    let start = list.len().saturating_sub(limit);
    let mut recent = list[start..].to_vec();
    // Pinned messages are kept when history is trimmed. Send the ones that
    // fall outside the recent window too, so opening a pin always works.
    for message in list.iter().filter(|message| message.pinned_at.is_some()) {
        if !recent.iter().any(|item| item.id == message.id) {
            recent.push(message.clone());
        }
    }
    recent.sort_by_key(|message| message.at);
    recent
}

fn poll_is_closed(poll: &Poll, now: u64) -> bool {
    poll.closed_at.is_some() || poll.closes_at.map(|at| at <= now).unwrap_or(false)
}

fn sanitize_poll_options(value: &Value) -> Option<Vec<PollOption>> {
    let raw = value.as_array()?;
    let mut options = Vec::new();
    let mut seen = HashSet::new();
    for item in raw {
        let text = take_chars(
            &item
                .as_str()
                .unwrap_or("")
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" "),
            100,
        );
        if text.is_empty() {
            continue;
        }
        let key = text.to_lowercase();
        if !seen.insert(key) {
            continue;
        }
        options.push(PollOption {
            id: format!("o{}", options.len() + 1),
            text,
        });
        if options.len() >= 10 {
            break;
        }
    }
    if options.len() < 2 {
        None
    } else {
        Some(options)
    }
}

fn toggle_poll_vote(poll: &mut Poll, member_id: &str, option_id: &str) -> bool {
    if !poll.options.iter().any(|option| option.id == option_id) {
        return false;
    }
    let selected = poll
        .votes
        .get(option_id)
        .map(|voters| voters.iter().any(|id| id == member_id))
        .unwrap_or(false);
    if selected {
        if let Some(voters) = poll.votes.get_mut(option_id) {
            voters.retain(|id| id != member_id);
            if voters.is_empty() {
                poll.votes.remove(option_id);
            }
        }
        return true;
    }
    if !poll.multi {
        for voters in poll.votes.values_mut() {
            voters.retain(|id| id != member_id);
        }
        poll.votes.retain(|_, voters| !voters.is_empty());
    }
    poll.votes
        .entry(option_id.to_string())
        .or_default()
        .push(member_id.to_string());
    true
}

fn pinned_messages_payload(server: &Server) -> Map<String, Value> {
    let mut pins = Map::new();
    for channel in &server.channels {
        let list = server
            .messages
            .get(&channel.id)
            .map(|messages| {
                messages
                    .iter()
                    .filter(|message| message.pinned_at.is_some())
                    .cloned()
                    .collect::<Vec<Message>>()
            })
            .unwrap_or_default();
        if !list.is_empty() {
            pins.insert(channel.id.clone(), json!(list));
        }
    }
    pins
}

fn member_identity(value: &str) -> String {
    value
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
        .take(64)
        .collect()
}

fn same_member_name(a: &str, b: &str) -> bool {
    !a.trim().is_empty() && a.trim().eq_ignore_ascii_case(b.trim())
}

fn legacy_member_is_ghost(member: &ServerMember) -> bool {
    member.account_id.is_empty()
        && (member.handle.is_empty()
            || member.handle == handle_for_account(&member.id, &member.name, ""))
}

fn member_has_history(server: &Server, member_id: &str) -> bool {
    if member_id.is_empty() {
        return false;
    }
    server
        .messages
        .values()
        .any(|list| list.iter().any(|message| message.author_id == member_id))
        || server.dms.iter().any(|(key, list)| {
            !list.is_empty() && key.split('|').any(|part| part == member_id)
        })
}

fn remap_member_history(server: &mut Server, from: &str, to: &str) {
    if from.is_empty() || to.is_empty() || from == to {
        return;
    }
    for list in server.messages.values_mut() {
        for message in list.iter_mut() {
            if message.author_id == from {
                message.author_id = to.to_string();
            }
        }
    }
    let affected: Vec<(String, Vec<Message>)> = server
        .dms
        .iter()
        .filter(|(key, _)| key.split('|').any(|part| part == from))
        .map(|(key, list)| (key.clone(), list.clone()))
        .collect();
    for (key, list) in affected {
        server.dms.remove(&key);
        if list.is_empty() {
            continue;
        }
        let parts: Vec<&str> = key.split('|').collect();
        if parts.len() != 2 {
            continue;
        }
        let other = if parts[0] == from { parts[1] } else { parts[0] };
        if other == to {
            continue;
        }
        let new_key = dm_key(to, other);
        let target = server.dms.entry(new_key).or_default();
        let mut seen: HashSet<String> = target.iter().map(|message| message.id.clone()).collect();
        for mut message in list {
            if message.author_id == from {
                message.author_id = to.to_string();
            }
            if seen.insert(message.id.clone()) {
                target.push(message);
            }
        }
        target.sort_by_key(|message| message.at);
        let start = target.len().saturating_sub(500);
        *target = target[start..].to_vec();
    }
}

fn handle_message(state: &AppState, conn_id: u64, local: bool, ip: &str, msg: &Value) {
    let message_type = msg.get("type").and_then(Value::as_str).unwrap_or("");
    match message_type {
        "join" => handle_join(state, conn_id, local, msg),
        "join-server" => handle_join_server(state, conn_id, local, ip, msg),
        "server:leave" => handle_server_leave(state, conn_id),
        "server:message" => handle_server_message(state, conn_id, msg),
        "server:reaction" => handle_server_reaction(state, conn_id, msg),
        "server:edit" => handle_server_edit(state, conn_id, msg),
        "server:delete" => handle_server_delete(state, conn_id, msg),
        "server:pin" => handle_server_pin(state, conn_id, msg),
        "server:poll" => handle_server_poll(state, conn_id, msg),
        "server:poll:vote" => handle_server_poll_vote(state, conn_id, msg),
        "server:poll:close" => handle_server_poll_close(state, conn_id, msg),
        "server:dm" => handle_server_dm(state, conn_id, msg),
        "server:dm:reaction" => handle_server_dm_reaction(state, conn_id, msg),
        "server:dm:edit" => handle_server_dm_edit(state, conn_id, msg),
        "server:dm:delete" => handle_server_dm_delete(state, conn_id, msg),
        "server:dm:typing" => handle_server_dm_typing(state, conn_id, msg),
        "server:typing" => handle_server_typing(state, conn_id, msg),
        "friends:request" => handle_friend_request(state, conn_id, msg),
        "friends:accept" => handle_friend_accept(state, conn_id, msg),
        "friends:decline" => handle_friend_decline(state, conn_id, msg),
        "friends:remove" => handle_friend_remove(state, conn_id, msg),
        "spotify:set" => handle_spotify_set(state, conn_id, msg),
        "spotify:clear" => handle_spotify_clear(state, conn_id, msg),
        "voice:refresh" => handle_voice_refresh(state, conn_id, local, msg),
        "voice:join" => handle_voice_join(state, conn_id, msg),
        "voice:leave" => handle_voice_leave(state, conn_id),
        "voice:update" => handle_voice_update(state, conn_id, msg),
        "voice:share" => handle_voice_share(state, conn_id, msg),
        "server:channel:create" => handle_channel_create(state, conn_id, msg),
        "server:channel:rename" => handle_channel_rename(state, conn_id, msg),
        "server:channel:duplicate" => handle_channel_duplicate(state, conn_id, msg),
        "server:channel:move" => handle_channel_move(state, conn_id, msg),
        "server:channel:delete" => handle_channel_delete(state, conn_id, msg),
        "server:channel:category" => handle_channel_category(state, conn_id, msg),
        "server:category:create" => handle_category_create(state, conn_id, msg),
        "server:category:rename" => handle_category_rename(state, conn_id, msg),
        "server:category:delete" => handle_category_delete(state, conn_id, msg),
        "server:profile" => handle_server_profile(state, conn_id, msg),
        "server:update" => handle_server_update(state, conn_id, msg),
        "server:activity" => handle_server_activity(state, conn_id, msg),
        "dm" => handle_dm(state, conn_id, local, msg),
        "dm:reaction" => handle_dm_reaction(state, conn_id, local, msg),
        "dm:edit" => handle_dm_edit(state, conn_id, local, msg),
        "dm:delete" => handle_dm_delete(state, conn_id, local, msg),
        "dm:typing" => handle_dm_typing(state, conn_id, local, msg),
        "activity" => handle_activity(state, conn_id, local, msg),
        "status" => handle_status(state, conn_id, local, msg),
        "profile" => handle_profile(state, conn_id, local, msg),
        // Klient wysyła lekki heartbeat, żeby proxy nie zamykało bezczynnego
        // gniazda po ~60 s. Odpowiedź utrzymuje ruch w obie strony.
        "ping" => send(state, conn_id, &json!({ "type": "pong" })),
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
    send(state, conn_id, &state.friend_state_payload(&account.id));
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
    let mut account_id = if state.cfg.public_web {
        account
            .as_ref()
            .map(|account| account.id.clone())
            .unwrap_or_default()
    } else {
        member_identity(&payload_string(msg, "accountId"))
    };
    if !owner && !account_id.is_empty() && account_id == server.owner_id {
        account_id.clear();
    }
    let mut member_id = if state.cfg.public_web {
        account_id.clone()
    } else {
        member_identity(&payload_string(msg, "memberId"))
    };
    if member_id.is_empty() {
        member_id = account_id.clone();
    }
    if !state.cfg.public_web {
        if owner {
            member_id = server.owner_id.clone();
            if account_id.is_empty() {
                account_id = server.owner_id.clone();
            }
        } else if member_id == server.owner_id {
            member_id.clear();
        }
    }
    if member_id.is_empty() && !account_id.is_empty() {
        member_id = account_id.clone();
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

    let mut server = server;
    let online: HashSet<String> = state
        .conns()
        .into_iter()
        .filter_map(|conn| conn.server.map(|session| session.member_id))
        .collect();
    let mut member_index = if member_id.is_empty() {
        None
    } else {
        server.members.iter().position(|member| {
            member.id == member_id
                && (owner || !member.owner)
                && (account_id.is_empty()
                    || member.account_id.is_empty()
                    || member.account_id == account_id)
        })
    };
    if member_index.is_none() && !account_id.is_empty() {
        member_index = server.members.iter().position(|member| {
            !member.owner && !member.account_id.is_empty() && member.account_id == account_id
        });
    }
    if member_index.is_none() && !owner && !account_id.is_empty() {
        member_index = server
            .members
            .iter()
            .enumerate()
            .filter(|(_, member)| {
                !member.owner
                    && member.account_id.is_empty()
                    && same_member_name(&member.name, &name)
                    && !online.contains(&member.id)
                    && legacy_member_is_ghost(member)
            })
            .max_by_key(|(_, member)| member.last_seen.max(member.joined_at))
            .map(|(index, _)| index);
    }
    if let Some(index) = member_index {
        member_id = server.members[index].id.clone();
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

    if let Some(index) = member_index {
        let member = &mut server.members[index];
        member.name = name.clone();
        member.color = color.clone();
        member.owner = owner;
        member.last_seen = now_ms();
        if !account_id.is_empty() {
            member.account_id = account_id.clone();
        }
        apply_member_patch(member, &patch);
    } else {
        let candidate = if !member_id.is_empty() {
            member_id.clone()
        } else if !account_id.is_empty() {
            account_id.clone()
        } else {
            random_uuid()
        };
        member_id = if candidate.is_empty()
            || server.members.iter().any(|member| member.id == candidate)
        {
            random_uuid()
        } else {
            candidate
        };
        let mut member = ServerMember {
            id: member_id.clone(),
            account_id: account_id.clone(),
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

    // Merge duplicates left behind by older clients and drop empty legacy ghosts.
    let account_dupes: Vec<String> = if account_id.is_empty() {
        Vec::new()
    } else {
        server
            .members
            .iter()
            .filter(|member| {
                member.id != member_id
                    && !member.owner
                    && !online.contains(&member.id)
                    && !member.account_id.is_empty()
                    && member.account_id == account_id
            })
            .map(|member| member.id.clone())
            .collect()
    };
    for id in &account_dupes {
        remap_member_history(&mut server, id, &member_id);
    }
    let legacy_ghosts: Vec<String> = if account_id.is_empty() || owner {
        Vec::new()
    } else {
        server
            .members
            .iter()
            .filter(|member| {
                member.id != member_id
                    && !member.owner
                    && !online.contains(&member.id)
                    && member.account_id.is_empty()
                    && same_member_name(&member.name, &name)
                    && legacy_member_is_ghost(member)
                    && !member_has_history(&server, &member.id)
            })
            .map(|member| member.id.clone())
            .collect()
    };
    let mut removed_ids = account_dupes;
    removed_ids.extend(legacy_ghosts);
    if !removed_ids.is_empty() {
        server
            .members
            .retain(|member| !removed_ids.iter().any(|id| id == &member.id));
        server.dms.retain(|key, list| {
            let references = key
                .split('|')
                .any(|part| removed_ids.iter().any(|id| id == part));
            !(references && list.is_empty())
        });
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
        messages.insert(
            channel.id.clone(),
            json!(recent_messages_with_pins(&list, 300)),
        );
    }
    let dms = state.server_dms_payload(&server, &member_id);
    let pins = pinned_messages_payload(&server);
    let voice = state.voice_rooms_payload(&server.id);
    let spotify = state.spotify_rooms_payload(&server.id);
    send(
        state,
        conn_id,
        &json!({
            "type": "server:joined",
            "server": server_info(&server),
            "members": state.server_members_payload(&server),
            "messages": messages,
            "dms": dms,
            "pins": pins,
            "you": { "memberId": member_id, "owner": owner },
            "voice": voice,
            "spotify": spotify,
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
        "categories": server.categories.iter().map(|category| json!({
            "id": category.id,
            "name": category.name,
            "createdAt": category.created_at,
        })).collect::<Vec<Value>>(),
        "channels": server.channels.iter().map(channel_payload).collect::<Vec<Value>>(),
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
    let reply_to_id = payload_string(msg, "replyToId");
    let reply_to_client_id = payload_string(msg, "replyToClientId");
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
            client_id: payload_client_id(msg),
            channel_id: Some(channel.id.clone()),
            author_id: session.member_id.clone(),
            author_name: session.name.clone(),
            author_color: session.color.clone(),
            to: None,
            text,
            at: now_ms(),
            reply_to: server
                .messages
                .get(&channel.id)
                .and_then(|list| reply_target(list, &reply_to_id, &reply_to_client_id)),
            ..Default::default()
        };
        let list = server.messages.entry(channel.id.clone()).or_default();
        list.push(message.clone());
        dropped = trim_messages(list, 300);
        server_id = server.id.clone();
        let payload = json!({ "type": "server:message", "message": message });
        drop(store);
        state.save_servers();
        state.broadcast_server(&server_id, payload, None);
    }
    if let Some(message) = dropped {
        state.remove_media_from_messages(&[message]);
    }
}

fn handle_server_reaction(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let channel_id = payload_string(msg, "channelId");
    let message_id = payload_string(msg, "messageId");
    let client_id = payload_string(msg, "clientId");
    let Some(emoji) = sanitize_reaction_emoji(&payload_string(msg, "emoji")) else {
        return;
    };
    let mut payload = None;
    let mut server_id = String::new();
    {
        let mut store = state.servers.write();
        let Some(server) = store
            .hosted
            .iter_mut()
            .find(|server| server.id == session.server_id)
        else {
            return;
        };
        server_id = server.id.clone();
        let Some(list) = server.messages.get_mut(&channel_id) else {
            return;
        };
        let Some(index) = message_index(list, &message_id, &client_id) else {
            return;
        };
        let message = &mut list[index];
        toggle_reaction(message, &session.member_id, &emoji);
        payload = Some(json!({
            "type": "server:reaction",
            "channelId": channel_id,
            "message": message,
        }));
    }
    state.save_servers();
    if let Some(payload) = payload {
        state.broadcast_server(&server_id, payload, None);
    }
}

fn handle_server_edit(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let channel_id = payload_string(msg, "channelId");
    let message_id = payload_string(msg, "messageId");
    let client_id = payload_string(msg, "clientId");
    let text = take_chars(payload_string(msg, "text").trim(), 4000);
    if text.is_empty() {
        return;
    }
    let mut payload = None;
    let mut server_id = String::new();
    let mut poll_message = false;
    {
        let mut store = state.servers.write();
        let Some(server) = store
            .hosted
            .iter_mut()
            .find(|server| server.id == session.server_id)
        else {
            return;
        };
        server_id = server.id.clone();
        let Some(list) = server.messages.get_mut(&channel_id) else {
            return;
        };
        let Some(index) = message_index(list, &message_id, &client_id) else {
            return;
        };
        if list[index].author_id != session.member_id {
            return;
        }
        if list[index].poll.is_some() {
            poll_message = true;
        } else {
            list[index].text = text.clone();
            list[index].edited_at = Some(now_ms());
            let message = list[index].clone();
            for other in server.messages.values_mut() {
                for item in other.iter_mut() {
                    if item
                        .reply_to
                        .as_ref()
                        .map(|reply| reply.id == message.id)
                        .unwrap_or(false)
                    {
                        if let Some(reply) = item.reply_to.as_mut() {
                            reply.text = take_chars(text.trim(), 120);
                        }
                    }
                }
            }
            payload = Some(json!({
                "type": "server:edit",
                "channelId": channel_id,
                "message": message,
            }));
        }
    }
    if poll_message {
        send_server_error(
            state,
            conn_id,
            "poll-message",
            "Nie można edytować treści ankiety.",
        );
        return;
    }
    state.save_servers();
    if let Some(payload) = payload {
        state.broadcast_server(&server_id, payload, None);
    }
}

fn handle_server_delete(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let channel_id = payload_string(msg, "channelId");
    let message_id = payload_string(msg, "messageId");
    let client_id = payload_string(msg, "clientId");
    let mut removed = None;
    let mut server_id = String::new();
    {
        let mut store = state.servers.write();
        let Some(server) = store
            .hosted
            .iter_mut()
            .find(|server| server.id == session.server_id)
        else {
            return;
        };
        server_id = server.id.clone();
        let Some(list) = server.messages.get_mut(&channel_id) else {
            return;
        };
        let Some(index) = message_index(list, &message_id, &client_id) else {
            return;
        };
        if list[index].author_id != session.member_id {
            return;
        }
        removed = Some(list.remove(index));
    }
    state.save_servers();
    if let Some(message) = removed {
        state.remove_media_from_messages(std::slice::from_ref(&message));
        state.broadcast_server(
            &server_id,
            json!({
                "type": "server:delete",
                "channelId": channel_id,
                "messageId": message.id,
                "clientId": message.client_id,
            }),
            None,
        );
    }
}

fn handle_server_pin(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let channel_id = payload_string(msg, "channelId");
    let message_id = payload_string(msg, "messageId");
    let client_id = payload_string(msg, "clientId");
    let pinned = payload_bool(msg, "pinned");
    let mut payload = None;
    let mut server_id = String::new();
    let mut error: Option<(&str, &str)> = None;
    {
        let mut store = state.servers.write();
        let Some(server) = store
            .hosted
            .iter_mut()
            .find(|server| server.id == session.server_id)
        else {
            return;
        };
        server_id = server.id.clone();
        let Some(list) = server.messages.get_mut(&channel_id) else {
            return;
        };
        let Some(index) = message_index(list, &message_id, &client_id) else {
            return;
        };
        let can_pin = session.owner || list[index].author_id == session.member_id;
        if !can_pin {
            error = Some(("forbidden", "Możesz przypinać tylko własne wiadomości."));
        } else if pinned {
            let count = list
                .iter()
                .filter(|message| message.pinned_at.is_some())
                .count();
            if list[index].pinned_at.is_none() && count >= 100 {
                error = Some(("pin-limit", "Na tym kanale jest już 100 przypiętych wiadomości."));
            } else if list[index].pinned_at.is_none() {
                list[index].pinned_at = Some(now_ms());
            }
        } else {
            list[index].pinned_at = None;
        }
        if error.is_none() {
            payload = Some(json!({
                "type": "server:pin",
                "channelId": channel_id,
                "message": list[index],
                "actorId": session.member_id,
            }));
        }
    }
    if let Some((code, message)) = error {
        send_server_error(state, conn_id, code, message);
        return;
    }
    if let Some(payload) = payload {
        state.save_servers();
        state.broadcast_server(&server_id, payload, None);
    }
}

fn handle_server_poll(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let channel_id = payload_string(msg, "channelId");
    let question = take_chars(payload_string(msg, "text").trim(), 300);
    if question.is_empty() {
        send_server_error(state, conn_id, "poll-invalid", "Podaj pytanie ankiety.");
        return;
    }
    let Some(options) = sanitize_poll_options(msg.get("options").unwrap_or(&Value::Null)) else {
        send_server_error(
            state,
            conn_id,
            "poll-invalid",
            "Ankieta potrzebuje od 2 do 10 unikalnych odpowiedzi.",
        );
        return;
    };
    let duration_minutes = payload_u64(msg, "durationMinutes").unwrap_or(0);
    let closes_at = if duration_minutes == 0 {
        None
    } else {
        Some(now_ms() + duration_minutes.clamp(60, 10_080) * 60_000)
    };
    let reply_to_id = payload_string(msg, "replyToId");
    let reply_to_client_id = payload_string(msg, "replyToClientId");
    let mut dropped = None;
    let mut server_id = String::new();
    {
        let mut store = state.servers.write();
        let Some(server) = store
            .hosted
            .iter_mut()
            .find(|server| server.id == session.server_id)
        else {
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
                "Kanały głosowe nie obsługują ankiet.",
            );
            return;
        }
        let message = Message {
            id: new_message_id(),
            client_id: payload_client_id(msg),
            channel_id: Some(channel.id.clone()),
            author_id: session.member_id.clone(),
            author_name: session.name.clone(),
            author_color: session.color.clone(),
            to: None,
            text: question,
            at: now_ms(),
            reply_to: server
                .messages
                .get(&channel.id)
                .and_then(|list| reply_target(list, &reply_to_id, &reply_to_client_id)),
            poll: Some(Poll {
                options,
                votes: Default::default(),
                multi: payload_bool(msg, "multi"),
                created_at: now_ms(),
                closes_at,
                closed_at: None,
            }),
            ..Default::default()
        };
        let list = server.messages.entry(channel.id.clone()).or_default();
        list.push(message.clone());
        dropped = trim_messages(list, 300);
        server_id = server.id.clone();
        let payload = json!({ "type": "server:message", "message": message });
        drop(store);
        state.save_servers();
        state.broadcast_server(&server_id, payload, None);
    }
    if let Some(message) = dropped {
        state.remove_media_from_messages(&[message]);
    }
}

fn handle_server_poll_vote(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let channel_id = payload_string(msg, "channelId");
    let message_id = payload_string(msg, "messageId");
    let client_id = payload_string(msg, "clientId");
    let option_id = payload_string(msg, "optionId");
    let mut payload = None;
    let mut server_id = String::new();
    let mut closed = false;
    {
        let mut store = state.servers.write();
        let Some(server) = store
            .hosted
            .iter_mut()
            .find(|server| server.id == session.server_id)
        else {
            return;
        };
        server_id = server.id.clone();
        let Some(list) = server.messages.get_mut(&channel_id) else {
            return;
        };
        let Some(index) = message_index(list, &message_id, &client_id) else {
            return;
        };
        let now = now_ms();
        let Some(poll) = list[index].poll.as_mut() else {
            return;
        };
        if poll_is_closed(poll, now) {
            closed = true;
        } else if toggle_poll_vote(poll, &session.member_id, &option_id) {
            payload = Some(json!({
                "type": "server:poll:update",
                "channelId": channel_id,
                "message": list[index],
            }));
        }
    }
    if closed {
        send_server_error(state, conn_id, "poll-closed", "Ta ankieta jest już zamknięta.");
        return;
    }
    if let Some(payload) = payload {
        state.save_servers();
        state.broadcast_server(&server_id, payload, None);
    }
}

fn handle_server_poll_close(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let channel_id = payload_string(msg, "channelId");
    let message_id = payload_string(msg, "messageId");
    let client_id = payload_string(msg, "clientId");
    let mut payload = None;
    let mut server_id = String::new();
    let mut forbidden = false;
    {
        let mut store = state.servers.write();
        let Some(server) = store
            .hosted
            .iter_mut()
            .find(|server| server.id == session.server_id)
        else {
            return;
        };
        server_id = server.id.clone();
        let Some(list) = server.messages.get_mut(&channel_id) else {
            return;
        };
        let Some(index) = message_index(list, &message_id, &client_id) else {
            return;
        };
        if !session.owner && list[index].author_id != session.member_id {
            forbidden = true;
        } else if let Some(poll) = list[index].poll.as_mut() {
            if poll.closed_at.is_none() {
                poll.closed_at = Some(now_ms());
                payload = Some(json!({
                    "type": "server:poll:update",
                    "channelId": channel_id,
                    "message": list[index],
                }));
            }
        }
    }
    if forbidden {
        send_server_error(state, conn_id, "forbidden", "Tylko autor ankiety może ją zamknąć.");
        return;
    }
    if let Some(payload) = payload {
        state.save_servers();
        state.broadcast_server(&server_id, payload, None);
    }
}

fn handle_server_dm(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let to = payload_string(msg, "to");
    let text = take_chars(payload_string(msg, "text").trim(), 4000);
    let reply_to_id = payload_string(msg, "replyToId");
    let reply_to_client_id = payload_string(msg, "replyToClientId");
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
        drop(store);
        if state.cfg.public_web && !state.are_friends(&session.member_id, &to) {
            send_server_error(
                state,
                conn_id,
                "not-friends",
                "Aby wysłać wiadomość, najpierw zaczekaj na akceptację zaproszenia.",
            );
            return;
        }
        let mut store = state.servers.write();
        let Some(server) = store.hosted.iter_mut().find(|server| server.id == session.server_id) else {
            return;
        };
        let key = dm_key(&session.member_id, &to);
        let reply_to = server
            .dms
            .get(&key)
            .and_then(|list| reply_target(list, &reply_to_id, &reply_to_client_id));
        let message = Message {
            id: new_message_id(),
            client_id: payload_client_id(msg),
            channel_id: None,
            author_id: session.member_id.clone(),
            author_name: session.name.clone(),
            author_color: session.color.clone(),
            to: Some(to.clone()),
            text,
            at: now_ms(),
            reply_to,
            ..Default::default()
        };
        let list = server.dms.entry(key.clone()).or_default();
        list.push(message.clone());
        if list.len() > 500 {
            dropped = list.first().cloned();
            list.remove(0);
        }
        payload = json!({
            "type": "server:dm",
            "serverId": server.id,
            "dmKey": key,
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
        state.remove_media_from_messages(&[message]);
    }
}

fn session_server_id(payload: &Value) -> String {
    payload
        .get("serverId")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

fn broadcast_server_dm_event(
    state: &AppState,
    server_id: &str,
    first: &str,
    second: &str,
    payload: &Value,
) {
    for target in state.conns() {
        let matches = target
            .server
            .as_ref()
            .map(|session| {
                session.server_id == server_id
                    && (session.member_id == first || session.member_id == second)
            })
            .unwrap_or(false);
        if matches {
            target.send_json(payload);
        }
    }
}

fn handle_server_dm_reaction(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let to = payload_string(msg, "to");
    let message_id = payload_string(msg, "messageId");
    let client_id = payload_string(msg, "clientId");
    let Some(emoji) = sanitize_reaction_emoji(&payload_string(msg, "emoji")) else {
        return;
    };
    if to.is_empty() || to == session.member_id {
        return;
    }
    let key = dm_key(&session.member_id, &to);
    let mut updated = None;
    {
        let mut store = state.servers.write();
        let Some(server) = store
            .hosted
            .iter_mut()
            .find(|server| server.id == session.server_id)
        else {
            return;
        };
        if !server.members.iter().any(|member| member.id == to) {
            return;
        }
        let Some(list) = server.dms.get_mut(&key) else {
            return;
        };
        let Some(index) = message_index(list, &message_id, &client_id) else {
            return;
        };
        let message = &mut list[index];
        toggle_reaction(message, &session.member_id, &emoji);
        updated = Some(message.clone());
    }
    state.save_servers();
    if let Some(message) = updated {
        broadcast_server_dm_event(
            state,
            &session.server_id,
            &session.member_id,
            &to,
            &json!({
                "type": "server:dm:reaction",
                "serverId": session.server_id,
                "dmKey": key,
                "message": message,
            }),
        );
    }
}

fn handle_server_dm_edit(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let to = payload_string(msg, "to");
    let message_id = payload_string(msg, "messageId");
    let client_id = payload_string(msg, "clientId");
    let text = take_chars(payload_string(msg, "text").trim(), 4000);
    if to.is_empty() || to == session.member_id || text.is_empty() {
        return;
    }
    let key = dm_key(&session.member_id, &to);
    let mut updated = None;
    {
        let mut store = state.servers.write();
        let Some(server) = store
            .hosted
            .iter_mut()
            .find(|server| server.id == session.server_id)
        else {
            return;
        };
        let Some(list) = server.dms.get_mut(&key) else {
            return;
        };
        let Some(index) = message_index(list, &message_id, &client_id) else {
            return;
        };
        let message = &mut list[index];
        if message.author_id != session.member_id {
            return;
        }
        message.text = text;
        message.edited_at = Some(now_ms());
        updated = Some(message.clone());
    }
    state.save_servers();
    if let Some(message) = updated {
        broadcast_server_dm_event(
            state,
            &session.server_id,
            &session.member_id,
            &to,
            &json!({
                "type": "server:dm:edit",
                "serverId": session.server_id,
                "dmKey": key,
                "message": message,
            }),
        );
    }
}

fn handle_server_dm_delete(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let to = payload_string(msg, "to");
    let message_id = payload_string(msg, "messageId");
    let client_id = payload_string(msg, "clientId");
    if to.is_empty() || to == session.member_id {
        return;
    }
    let key = dm_key(&session.member_id, &to);
    let mut removed = None;
    {
        let mut store = state.servers.write();
        let Some(server) = store
            .hosted
            .iter_mut()
            .find(|server| server.id == session.server_id)
        else {
            return;
        };
        let Some(list) = server.dms.get_mut(&key) else {
            return;
        };
        let Some(index) = message_index(list, &message_id, &client_id) else {
            return;
        };
        if list[index].author_id != session.member_id {
            return;
        }
        removed = Some(list.remove(index));
    }
    state.save_servers();
    if let Some(message) = removed {
        state.remove_media_from_messages(std::slice::from_ref(&message));
        broadcast_server_dm_event(
            state,
            &session.server_id,
            &session.member_id,
            &to,
            &json!({
                "type": "server:dm:delete",
                "serverId": session.server_id,
                "dmKey": key,
                "messageId": message.id,
                "clientId": message.client_id,
            }),
        );
    }
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

fn handle_voice_refresh(state: &AppState, conn_id: u64, local: bool, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let scope = payload_string(msg, "scope");
    if scope == "local" {
        if !local {
            return;
        }
        let Some(user_id) = conn.user_id.clone() else { return };
        if state.find_user(&user_id).is_none() {
            return;
        }
        let key = state.issue_voice_token(conn_id, "local", &user_id);
        send(
            state,
            conn_id,
            &json!({ "type": "voice:token", "scope": scope, "key": key }),
        );
        return;
    }
    let Some(session) = conn.server.clone() else { return };
    if scope != format!("server:{}", session.server_id) {
        return;
    }
    let Some(server) = state.find_hosted(&session.server_id) else { return };
    if !server.members.iter().any(|member| member.id == session.member_id) {
        return;
    }
    let key = state.issue_voice_token(conn_id, &scope, &session.member_id);
    send(
        state,
        conn_id,
        &json!({ "type": "voice:token", "scope": scope, "key": key }),
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
            "spotify": state.spotify_state(&server.id, &channel_id),
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
    let requested_category = payload_string(msg, "categoryId");
    let category_id = if requested_category.is_empty() {
        String::new()
    } else if server
        .categories
        .iter()
        .any(|category| category.id == requested_category)
    {
        requested_category
    } else {
        send_server_error(
            state,
            conn_id,
            "invalid-category",
            "Nie znaleziono kategorii kanału.",
        );
        return;
    };
    let channel = Channel {
        id: make_channel_id(),
        name,
        channel_type: if payload_string(msg, "channelType") == "voice" {
            "voice".to_string()
        } else {
            "text".to_string()
        },
        created_at: now_ms(),
        category_id,
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
        "categoryId": channel.category_id,
    })
}

fn categories_payload(server: &Server) -> Vec<Value> {
    server
        .categories
        .iter()
        .map(|category| {
            json!({
                "id": category.id,
                "name": category.name,
                "createdAt": category.created_at,
            })
        })
        .collect()
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
            category_id: source.category_id.clone(),
        };
        if source.channel_type == "text" {
            let source_messages = server.messages.get(&source.id).cloned().unwrap_or_default();
            let start = source_messages.len().saturating_sub(300);
            duplicated_messages = source_messages[start..]
                .iter()
                .map(|message| {
                    let mut copy = message.clone();
                    copy.id = new_message_id();
                    copy.channel_id = Some(channel.id.clone());
                    copy.pinned_at = None;
                    if let Some(poll) = copy.poll.as_mut() {
                        poll.votes.clear();
                        poll.created_at = now_ms();
                        poll.closes_at = None;
                        poll.closed_at = None;
                    }
                    copy
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
    state.clear_spotify_state(&server.id, &channel_id);
    state.save_servers();
    state.remove_media_from_messages(&removed_messages);
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

fn sanitize_category_name(value: &str) -> String {
    take_chars(
        &value
            .trim()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" "),
        32,
    )
}

fn make_category_id() -> String {
    format!("cat-{}", make_channel_id())
}

fn owner_session(state: &AppState, conn_id: u64) -> Option<ServerSession> {
    let conn = state.conn(conn_id)?;
    let session = conn.server.clone()?;
    let server = state.find_hosted(&session.server_id)?;
    if !session.owner || server.owner_id != session.member_id {
        send_server_error(
            state,
            conn_id,
            "forbidden",
            "Tylko właściciel serwera może zarządzać kategoriami.",
        );
        return None;
    }
    Some(session)
}

fn handle_category_create(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(session) = owner_session(state, conn_id) else {
        return;
    };
    let name = sanitize_category_name(&payload_string(msg, "name"));
    if name.is_empty() {
        send_server_error(
            state,
            conn_id,
            "invalid-category",
            "Podaj poprawną nazwę kategorii.",
        );
        return;
    }
    let mut server_id = String::new();
    let mut categories = Vec::new();
    {
        let mut store = state.servers.write();
        let Some(server) = store
            .hosted
            .iter_mut()
            .find(|server| server.id == session.server_id)
        else {
            return;
        };
        if server
            .categories
            .iter()
            .any(|category| category.name.to_lowercase() == name.to_lowercase())
        {
            drop(store);
            send_server_error(
                state,
                conn_id,
                "category-exists",
                "Kategoria o tej nazwie już istnieje.",
            );
            return;
        }
        if server.categories.len() >= 20 {
            drop(store);
            send_server_error(
                state,
                conn_id,
                "category-limit",
                "Możesz utworzyć maksymalnie 20 kategorii.",
            );
            return;
        }
        server.categories.push(ChannelCategory {
            id: make_category_id(),
            name,
            created_at: now_ms(),
        });
        categories = categories_payload(server);
        server_id = server.id.clone();
    }
    state.save_servers();
    state.broadcast_server(
        &server_id,
        json!({ "type": "server:categories", "categories": categories }),
        None,
    );
}

fn handle_category_rename(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(session) = owner_session(state, conn_id) else {
        return;
    };
    let category_id = payload_string(msg, "categoryId");
    let name = sanitize_category_name(&payload_string(msg, "name"));
    if name.is_empty() {
        send_server_error(
            state,
            conn_id,
            "invalid-category",
            "Podaj poprawną nazwę kategorii.",
        );
        return;
    }
    let mut server_id = String::new();
    let mut categories = Vec::new();
    {
        let mut store = state.servers.write();
        let Some(server) = store
            .hosted
            .iter_mut()
            .find(|server| server.id == session.server_id)
        else {
            return;
        };
        if !server
            .categories
            .iter()
            .any(|category| category.id == category_id)
        {
            drop(store);
            send_server_error(state, conn_id, "invalid-category", "Nie znaleziono kategorii.");
            return;
        }
        if server.categories.iter().any(|category| {
            category.id != category_id && category.name.to_lowercase() == name.to_lowercase()
        }) {
            drop(store);
            send_server_error(
                state,
                conn_id,
                "category-exists",
                "Kategoria o tej nazwie już istnieje.",
            );
            return;
        }
        if let Some(category) = server
            .categories
            .iter_mut()
            .find(|category| category.id == category_id)
        {
            category.name = name;
        }
        categories = categories_payload(server);
        server_id = server.id.clone();
    }
    state.save_servers();
    state.broadcast_server(
        &server_id,
        json!({ "type": "server:categories", "categories": categories }),
        None,
    );
}

fn handle_category_delete(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(session) = owner_session(state, conn_id) else {
        return;
    };
    let category_id = payload_string(msg, "categoryId");
    let mut server_id = String::new();
    let mut categories = Vec::new();
    let mut channels = Vec::new();
    {
        let mut store = state.servers.write();
        let Some(server) = store
            .hosted
            .iter_mut()
            .find(|server| server.id == session.server_id)
        else {
            return;
        };
        if !server
            .categories
            .iter()
            .any(|category| category.id == category_id)
        {
            drop(store);
            send_server_error(state, conn_id, "invalid-category", "Nie znaleziono kategorii.");
            return;
        }
        server
            .categories
            .retain(|category| category.id != category_id);
        for channel in &mut server.channels {
            if channel.category_id == category_id {
                channel.category_id.clear();
            }
        }
        categories = categories_payload(server);
        channels = channels_payload(server);
        server_id = server.id.clone();
    }
    state.save_servers();
    state.broadcast_server(
        &server_id,
        json!({
            "type": "server:categories",
            "categories": categories,
            "channels": channels,
        }),
        None,
    );
}

fn handle_channel_category(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(session) = owner_session(state, conn_id) else {
        return;
    };
    let channel_id = payload_string(msg, "channelId");
    let category_id = payload_string(msg, "categoryId");
    let mut server_id = String::new();
    let mut channels = Vec::new();
    {
        let mut store = state.servers.write();
        let Some(server) = store
            .hosted
            .iter_mut()
            .find(|server| server.id == session.server_id)
        else {
            return;
        };
        if !category_id.is_empty()
            && !server
                .categories
                .iter()
                .any(|category| category.id == category_id)
        {
            drop(store);
            send_server_error(state, conn_id, "invalid-category", "Nie znaleziono kategorii.");
            return;
        }
        let Some(channel) = server
            .channels
            .iter_mut()
            .find(|channel| channel.id == channel_id)
        else {
            drop(store);
            send_server_error(state, conn_id, "invalid-channel", "Nie znaleziono kanału.");
            return;
        };
        channel.category_id = category_id;
        channels = channels_payload(server);
        server_id = server.id.clone();
    }
    state.save_servers();
    state.broadcast_server(
        &server_id,
        json!({ "type": "server:channels", "channels": channels }),
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

fn current_user_id(state: &AppState, conn_id: u64) -> Option<String> {
    state.conn(conn_id).and_then(|conn| conn.user_id)
}

fn handle_friend_request(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(from) = current_user_id(state, conn_id) else { return };
    let to = take_chars(payload_string(msg, "to").trim(), 64);
    if to.is_empty() || to == from {
        return;
    }
    match state.friend_request(&from, &to) {
        Ok(()) => state.send_friend_state(&from),
        Err(message) => send(
            state,
            conn_id,
            &json!({ "type": "friends:error", "code": "request-failed", "message": message }),
        ),
    }
}

fn handle_friend_accept(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(user_id) = current_user_id(state, conn_id) else { return };
    let from = take_chars(payload_string(msg, "from").trim(), 64);
    if from.is_empty() || from == user_id {
        return;
    }
    state.friend_accept(&from, &user_id);
    state.send_friend_state(&user_id);
}

fn handle_friend_decline(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(user_id) = current_user_id(state, conn_id) else { return };
    let from = take_chars(payload_string(msg, "from").trim(), 64);
    if from.is_empty() || from == user_id {
        return;
    }
    state.friend_decline(&from, &user_id);
    state.send_friend_state(&user_id);
}

fn handle_friend_remove(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(user_id) = current_user_id(state, conn_id) else { return };
    let other = take_chars(
        &[
            payload_string(msg, "id"),
            payload_string(msg, "from"),
            payload_string(msg, "to"),
        ]
        .into_iter()
        .find(|value| !value.trim().is_empty())
        .unwrap_or_default(),
        64,
    );
    if other.is_empty() || other == user_id {
        return;
    }
    state.friend_remove(&user_id, &other);
    state.send_friend_state(&user_id);
}

fn spotify_kind_label(kind: &str) -> &'static str {
    match kind {
        "track" => "Utwór",
        "album" => "Album",
        "playlist" => "Playlista",
        "episode" => "Odcinek",
        "show" => "Podcast",
        "artist" => "Artysta",
        _ => "Spotify",
    }
}

fn normalize_spotify_link(raw: &str) -> Option<Value> {
    let text = raw.trim();
    if text.is_empty() {
        return None;
    }
    let (kind, id) = if let Some(rest) = text.strip_prefix("spotify:") {
        let mut parts = rest.splitn(2, ':');
        let kind = parts.next()?.to_lowercase();
        let id = parts.next()?.to_string();
        (kind, id)
    } else {
        let candidate = if text.starts_with("http://") || text.starts_with("https://") {
            text.to_string()
        } else if text.starts_with("open.spotify.com/") || text.starts_with("embed.spotify.com/") {
            format!("https://{}", text)
        } else {
            return None;
        };
        let url = url::Url::parse(&candidate).ok()?;
        let host = url.host_str().unwrap_or("").to_lowercase();
        if host != "open.spotify.com" && host != "embed.spotify.com" && host != "play.spotify.com" {
            return None;
        }
        let mut parts: Vec<String> = url
            .path_segments()
            .map(|segments| segments.filter(|part| !part.is_empty()).map(str::to_string).collect())
            .unwrap_or_default();
        if parts.first().map(|part| part == "embed").unwrap_or(false) {
            parts.remove(0);
        }
        if parts.first().map(|part| part == "intl-pl").unwrap_or(false) {
            parts.remove(0);
        }
        if parts.len() < 2 {
            return None;
        }
        (parts[0].to_lowercase(), parts[1].clone())
    };
    if !matches!(
        kind.as_str(),
        "track" | "album" | "playlist" | "episode" | "show" | "artist"
    ) {
        return None;
    }
    if id.len() < 16 || id.len() > 64 || !id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return None;
    }
    Some(json!({
        "kind": kind,
        "id": id,
        "url": format!("https://open.spotify.com/{}/{}", kind, id),
        "embed": format!("https://open.spotify.com/embed/{}/{}?utm_source=generator&theme=0", kind, id),
    }))
}

fn handle_spotify_set(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let Some(server) = state.find_hosted(&session.server_id) else { return };
    let channel_id = payload_string(msg, "channelId");
    let Some(channel) = server.channels.iter().find(|channel| channel.id == channel_id) else {
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
    let Some(link) = normalize_spotify_link(&payload_string(msg, "url")) else {
        send(
            state,
            conn_id,
            &json!({
                "type": "spotify:error",
                "code": "invalid-link",
                "message": "Nieprawidłowy link Spotify.",
            }),
        );
        return;
    };
    let kind = link.get("kind").and_then(Value::as_str).unwrap_or("track");
    let title = take_chars(
        payload_string(msg, "title").trim(),
        120,
    );
    let title = if title.is_empty() {
        spotify_kind_label(kind).to_string()
    } else {
        title
    };
    let value = json!({
        "kind": link.get("kind").cloned().unwrap_or(Value::Null),
        "id": link.get("id").cloned().unwrap_or(Value::Null),
        "url": link.get("url").cloned().unwrap_or(Value::Null),
        "embed": link.get("embed").cloned().unwrap_or(Value::Null),
        "title": title,
        "by": session.member_id,
        "byName": session.name,
        "at": now_ms(),
    });
    state.set_spotify_state(&server.id, &channel_id, value);
    state.broadcast_spotify(&server.id, &channel_id);
}

fn handle_spotify_clear(state: &AppState, conn_id: u64, msg: &Value) {
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(session) = conn.server.clone() else { return };
    let channel_id = payload_string(msg, "channelId");
    if channel_id.is_empty() {
        return;
    }
    if state.clear_spotify_state(&session.server_id, &channel_id) {
        state.broadcast_spotify(&session.server_id, &channel_id);
    }
}

fn handle_dm(state: &AppState, conn_id: u64, local: bool, msg: &Value) {
    if !local {
        return;
    }
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(user_id) = conn.user_id.clone() else { return };
    let to = payload_string(msg, "to");
    let text = payload_string(msg, "text");
    let reply_to_id = payload_string(msg, "replyToId");
    let reply_to_client_id = payload_string(msg, "replyToClientId");
    if to.is_empty() || text.is_empty() {
        return;
    }
    if state.find_user(&to).is_none() {
        return;
    }
    if !state.are_friends(&user_id, &to) {
        send(
            state,
            conn_id,
            &json!({
                "type": "dm:error",
                "code": "not-friends",
                "message": "Aby wysłać wiadomość, najpierw zaczekaj na akceptację zaproszenia.",
            }),
        );
        return;
    }
    let Some(user) = state.online.read().get(&user_id).cloned() else {
        return;
    };
    let key = dm_key(&user_id, &to);
    let mut dropped = None;
    let message = {
        let mut chat = state.chat.write();
        let reply_to = chat
            .dms
            .get(&key)
            .and_then(|list| reply_target(list, &reply_to_id, &reply_to_client_id));
        let message = Message {
            id: new_message_id(),
            client_id: payload_client_id(msg),
            channel_id: None,
            author_id: user_id.clone(),
            author_name: user.name,
            author_color: user.color,
            to: Some(to.clone()),
            text: take_chars(&text, 4000),
            at: now_ms(),
            reply_to,
            ..Default::default()
        };
        let list = chat.dms.entry(key.clone()).or_default();
        list.push(message.clone());
        if list.len() > 500 {
            dropped = list.first().cloned();
            list.remove(0);
        }
        message
    };
    state.save_chat();
    if let Some(message) = dropped {
        state.remove_media_from_messages(&[message]);
    }
    let payload = json!({ "type": "dm", "dmKey": key, "message": message });
    send(state, conn_id, &payload);
    if to != user_id {
        let target_conn = state.user_conns.lock().get(&to).copied();
        if let Some(target) = target_conn.and_then(|id| state.conn(id)) {
            target.send_json(&payload);
        }
    }
}

fn send_local_dm_event(
    state: &AppState,
    conn_id: u64,
    user_id: &str,
    to: &str,
    payload: &Value,
) {
    send(state, conn_id, payload);
    if to != user_id {
        let target_conn = state.user_conns.lock().get(to).copied();
        if let Some(target) = target_conn.and_then(|id| state.conn(id)) {
            target.send_json(payload);
        }
    }
}

fn handle_dm_reaction(state: &AppState, conn_id: u64, local: bool, msg: &Value) {
    if !local {
        return;
    }
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(user_id) = conn.user_id.clone() else { return };
    let to = payload_string(msg, "to");
    let message_id = payload_string(msg, "messageId");
    let client_id = payload_string(msg, "clientId");
    let Some(emoji) = sanitize_reaction_emoji(&payload_string(msg, "emoji")) else {
        return;
    };
    if to.is_empty() || to == user_id {
        return;
    }
    let key = dm_key(&user_id, &to);
    let mut updated = None;
    {
        let mut chat = state.chat.write();
        let Some(list) = chat.dms.get_mut(&key) else {
            return;
        };
        let Some(index) = message_index(list, &message_id, &client_id) else {
            return;
        };
        let message = &mut list[index];
        toggle_reaction(message, &user_id, &emoji);
        updated = Some(message.clone());
    }
    state.save_chat();
    if let Some(message) = updated {
        send_local_dm_event(
            state,
            conn_id,
            &user_id,
            &to,
            &json!({
                "type": "dm:reaction",
                "dmKey": key,
                "message": message,
            }),
        );
    }
}

fn handle_dm_edit(state: &AppState, conn_id: u64, local: bool, msg: &Value) {
    if !local {
        return;
    }
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(user_id) = conn.user_id.clone() else { return };
    let to = payload_string(msg, "to");
    let message_id = payload_string(msg, "messageId");
    let client_id = payload_string(msg, "clientId");
    let text = take_chars(payload_string(msg, "text").trim(), 4000);
    if to.is_empty() || to == user_id || text.is_empty() {
        return;
    }
    let key = dm_key(&user_id, &to);
    let mut updated = None;
    {
        let mut chat = state.chat.write();
        let Some(list) = chat.dms.get_mut(&key) else {
            return;
        };
        let Some(index) = message_index(list, &message_id, &client_id) else {
            return;
        };
        let message = &mut list[index];
        if message.author_id != user_id {
            return;
        }
        message.text = text;
        message.edited_at = Some(now_ms());
        updated = Some(message.clone());
    }
    state.save_chat();
    if let Some(message) = updated {
        send_local_dm_event(
            state,
            conn_id,
            &user_id,
            &to,
            &json!({
                "type": "dm:edit",
                "dmKey": key,
                "message": message,
            }),
        );
    }
}

fn handle_dm_delete(state: &AppState, conn_id: u64, local: bool, msg: &Value) {
    if !local {
        return;
    }
    let Some(conn) = state.conn(conn_id) else { return };
    let Some(user_id) = conn.user_id.clone() else { return };
    let to = payload_string(msg, "to");
    let message_id = payload_string(msg, "messageId");
    let client_id = payload_string(msg, "clientId");
    if to.is_empty() || to == user_id {
        return;
    }
    let key = dm_key(&user_id, &to);
    let mut removed = None;
    {
        let mut chat = state.chat.write();
        let Some(list) = chat.dms.get_mut(&key) else {
            return;
        };
        let Some(index) = message_index(list, &message_id, &client_id) else {
            return;
        };
        if list[index].author_id != user_id {
            return;
        }
        removed = Some(list.remove(index));
    }
    state.save_chat();
    if let Some(message) = removed {
        state.remove_media_from_messages(std::slice::from_ref(&message));
        send_local_dm_event(
            state,
            conn_id,
            &user_id,
            &to,
            &json!({
                "type": "dm:delete",
                "dmKey": key,
                "messageId": message.id,
                "clientId": message.client_id,
            }),
        );
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

#[cfg(test)]
mod tests {
    use super::*;

    fn message(id: &str, author: &str, at: u64) -> Message {
        Message {
            id: id.to_string(),
            author_id: author.to_string(),
            at,
            ..Default::default()
        }
    }

    #[test]
    fn reactions_toggle_per_member_and_clean_up() {
        let mut item = Message {
            id: "m1".to_string(),
            text: "hello".to_string(),
            ..Default::default()
        };
        toggle_reaction(&mut item, "u1", "🔥");
        assert_eq!(item.reactions.get("🔥").map(Vec::len), Some(1));
        toggle_reaction(&mut item, "u2", "🔥");
        assert_eq!(item.reactions.get("🔥").map(Vec::len), Some(2));
        toggle_reaction(&mut item, "u1", "🔥");
        assert_eq!(item.reactions.get("🔥"), Some(&vec!["u2".to_string()]));
        toggle_reaction(&mut item, "u2", "🔥");
        assert!(item.reactions.is_empty());
    }

    #[test]
    fn reaction_emoji_rejects_blank_values_and_trims_length() {
        assert_eq!(sanitize_reaction_emoji("  "), None);
        assert_eq!(sanitize_reaction_emoji(" 🔥 "), Some("🔥".to_string()));
        assert_eq!(sanitize_reaction_emoji(&"❤".repeat(20)).map(|value| value.chars().count()), Some(16));
    }

    #[test]
    fn poll_votes_toggle_and_single_choice_replaces_previous() {
        let mut poll = Poll {
            options: vec![
                PollOption {
                    id: "o1".to_string(),
                    text: "Tak".to_string(),
                },
                PollOption {
                    id: "o2".to_string(),
                    text: "Nie".to_string(),
                },
            ],
            ..Default::default()
        };
        assert!(toggle_poll_vote(&mut poll, "u1", "o1"));
        assert_eq!(poll.votes["o1"], vec!["u1".to_string()]);
        assert!(toggle_poll_vote(&mut poll, "u2", "o2"));
        assert_eq!(poll.votes["o2"], vec!["u2".to_string()]);
        assert!(toggle_poll_vote(&mut poll, "u1", "o2"));
        assert_eq!(poll.votes["o2"], vec!["u2".to_string(), "u1".to_string()]);
        assert!(!poll.votes.contains_key("o1"));
        assert!(toggle_poll_vote(&mut poll, "u1", "o2"));
        assert_eq!(poll.votes["o2"], vec!["u2".to_string()]);
        assert!(!toggle_poll_vote(&mut poll, "u1", "missing"));

        poll.multi = true;
        assert!(toggle_poll_vote(&mut poll, "u2", "o1"));
        assert_eq!(poll.votes["o1"], vec!["u2".to_string()]);
        assert_eq!(poll.votes["o2"], vec!["u2".to_string()]);
        assert!(toggle_poll_vote(&mut poll, "u2", "o1"));
        assert!(!poll.votes.contains_key("o1"));
    }

    #[test]
    fn poll_options_are_deduplicated_and_validated() {
        let options = sanitize_poll_options(&json!([" Tak ", "tak", "Nie", "", "  "]))
            .expect("valid poll");
        assert_eq!(options.len(), 2);
        assert_eq!(options[0].id, "o1");
        assert_eq!(options[0].text, "Tak");
        assert_eq!(options[1].text, "Nie");
        assert!(sanitize_poll_options(&json!(["tylko jedna"])).is_none());
        assert!(sanitize_poll_options(&json!([])).is_none());
        let many = sanitize_poll_options(&json!([
            "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"
        ]))
        .expect("limited poll");
        assert_eq!(many.len(), 10);
    }

    #[test]
    fn pinned_messages_survive_history_trim() {
        let mut list = (0..300)
            .map(|index| message(&format!("m{index}"), "u1", index))
            .collect::<Vec<Message>>();
        list[2].pinned_at = Some(10);
        list.push(message("new", "u1", 301));
        let dropped = trim_messages(&mut list, 300).expect("trimmed message");
        assert_eq!(dropped.id, "m0");
        assert_eq!(list.len(), 300);
        assert!(list.iter().any(|item| item.id == "m2" && item.pinned_at.is_some()));
    }

    #[test]
    fn recent_history_keeps_old_pins() {
        let mut list = (0..305)
            .map(|index| message(&format!("m{index}"), "u1", index))
            .collect::<Vec<Message>>();
        list[2].pinned_at = Some(10);
        let recent = recent_messages_with_pins(&list, 300);
        assert_eq!(recent.len(), 301);
        assert_eq!(recent[0].id, "m2");
        assert!(!recent.iter().any(|item| item.id == "m0"));
    }

    #[test]
    fn pinned_payload_contains_only_pinned_messages() {
        let mut server = Server::default();
        server.channels.push(Channel {
            id: "general".to_string(),
            name: "general".to_string(),
            channel_type: "text".to_string(),
            ..Default::default()
        });
        let mut pinned = message("m1", "u1", 1);
        pinned.pinned_at = Some(2);
        server.messages.insert(
            "general".to_string(),
            vec![pinned, message("m2", "u1", 3)],
        );
        let payload = pinned_messages_payload(&server);
        let list = payload["general"].as_array().expect("pins list");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0]["id"], "m1");
    }

    #[test]
    fn reply_preview_points_at_original_message() {
        let mut item = Message {
            id: "m2".to_string(),
            author_id: "u1".to_string(),
            author_name: "Ania".to_string(),
            text: "  odpowiedź  ".to_string(),
            ..Default::default()
        };
        let target = reply_target(&[message("m1", "u2", 1), item.clone()], "m2", "")
            .expect("reply target");
        assert_eq!(target.id, "m2");
        assert_eq!(target.text, "odpowiedź");
        assert!(reply_target(&[item.clone()], "missing", "").is_none());
        let mut optimistic = item.clone();
        optimistic.id = "local-1".to_string();
        optimistic.client_id = Some("c-1".to_string());
        let by_client = reply_target(&[optimistic], "", "c-1").expect("client reply target");
        assert_eq!(by_client.id, "local-1");
        item.reply_to = Some(target);
        assert_eq!(item.reply_to.unwrap().author_name, "Ania");
    }

    #[test]
    fn member_identity_keeps_safe_characters_only() {
        assert_eq!(
            member_identity(" 1ce12131-a151-46a6-82b9-27d790096651 "),
            "1ce12131-a151-46a6-82b9-27d790096651"
        );
        assert_eq!(member_identity("../zły<id>"), "zyid");
        assert_eq!(member_identity(&"a".repeat(80)).len(), 64);
    }

    #[test]
    fn legacy_ghost_detection_accepts_only_default_handles() {
        let mut member = ServerMember {
            id: "e7a520bc-1308-44d5-9d05-dc114b031183".to_string(),
            name: "mikrozul".to_string(),
            ..Default::default()
        };
        assert!(legacy_member_is_ghost(&member));
        member.handle = "mikrozul_31183".to_string();
        assert!(legacy_member_is_ghost(&member));
        member.handle = "mikrozul".to_string();
        assert!(!legacy_member_is_ghost(&member));
        member.handle.clear();
        member.account_id = "account-1".to_string();
        assert!(!legacy_member_is_ghost(&member));
    }

    #[test]
    fn remap_member_history_moves_authored_messages_and_dms() {
        let mut server = Server::default();
        server.messages.insert(
            "general".to_string(),
            vec![message("m1", "old", 1), message("m2", "other", 2)],
        );
        server.dms.insert(
            "old|other".to_string(),
            vec![message("d1", "old", 3), message("d2", "other", 4)],
        );
        server.dms.insert(
            "new|other".to_string(),
            vec![message("d2", "other", 4)],
        );
        remap_member_history(&mut server, "old", "new");
        assert_eq!(server.messages["general"][0].author_id, "new");
        assert_eq!(server.messages["general"][1].author_id, "other");
        let list = &server.dms["new|other"];
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, "d1");
        assert_eq!(list[1].id, "d2");
        assert!(!server.dms.contains_key("old|other"));
    }

    #[test]
    fn history_check_ignores_empty_dm_keys() {
        let mut server = Server::default();
        server.dms.insert("old|other".to_string(), Vec::new());
        assert!(!member_has_history(&server, "old"));
        server.dms.insert("old|other".to_string(), vec![message("d1", "old", 1)]);
        assert!(member_has_history(&server, "old"));
    }

    #[test]
    fn join_server_reuses_identity_and_cleans_legacy_duplicates() {
        use crate::config::Config;

        let data_dir = std::env::temp_dir().join(format!("chill-identity-{}", random_uuid()));
        let state = AppState::new(Config {
            port: 0,
            host: "127.0.0.1".to_string(),
            public_web: false,
            public_origin: None,
            data_dir: data_dir.clone(),
            web_root: std::path::PathBuf::new(),
            build: "test".to_string(),
            version: "test".to_string(),
        });
        let server = Server {
            id: "server-1".to_string(),
            owner_id: "host-account".to_string(),
            name: "Games".to_string(),
            invite: "TUZS4Q".to_string(),
            owner_key: "owner-key-123456789012345678901234".to_string(),
            members: vec![ServerMember {
                id: "host-account".to_string(),
                account_id: "host-account".to_string(),
                name: "Host".to_string(),
                owner: true,
                ..Default::default()
            }],
            ..Default::default()
        };
        {
            let mut store = state.servers.write();
            store.hosted.push(server);
        }

        let (tx, _rx) = unbounded_channel();
        let conn_id = state.register_conn(tx, String::new(), None);
        let join = |member_id: &str, account_id: &str| {
            json!({
                "type": "join-server",
                "invite": "TUZS4Q",
                "memberId": member_id,
                "accountId": account_id,
                "name": "mikrozul",
                "color": "#ffd166",
                "handle": "",
            })
        };

        handle_join_server(&state, conn_id, true, "127.0.0.1", &join("93738fe4-7274-4586-9415-dc46cd1b1b9d", ""));
        handle_join_server(&state, conn_id, true, "127.0.0.1", &join("e7a520bc-1308-44d5-9d05-dc114b031183", ""));
        {
            let mut store = state.servers.write();
            let hosted = &mut store.hosted[0];
            assert_eq!(
                hosted
                    .members
                    .iter()
                    .filter(|member| member.name == "mikrozul")
                    .count(),
                2
            );
            hosted
                .dms
                .insert("host-account|93738fe4-7274-4586-9415-dc46cd1b1b9d".to_string(), Vec::new());
        }

        handle_join_server(
            &state,
            conn_id,
            true,
            "127.0.0.1",
            &join("e7a520bc-1308-44d5-9d05-dc114b031183", "friend-account"),
        );
        let hosted = state.find_hosted("server-1").unwrap();
        let friends: Vec<&ServerMember> = hosted
            .members
            .iter()
            .filter(|member| member.name == "mikrozul")
            .collect();
        assert_eq!(friends.len(), 1);
        assert_eq!(friends[0].id, "e7a520bc-1308-44d5-9d05-dc114b031183");
        assert_eq!(friends[0].account_id, "friend-account");
        assert!(!hosted.dms.contains_key("host-account|93738fe4-7274-4586-9415-dc46cd1b1b9d"));

        handle_join_server(
            &state,
            conn_id,
            true,
            "127.0.0.1",
            &join("another-member-id", "friend-account"),
        );
        let hosted = state.find_hosted("server-1").unwrap();
        assert_eq!(
            hosted
                .members
                .iter()
                .filter(|member| member.name == "mikrozul")
                .count(),
            1
        );

        handle_join_server(
            &state,
            conn_id,
            true,
            "127.0.0.1",
            &join("host-account", "attacker-account"),
        );
        let hosted = state.find_hosted("server-1").unwrap();
        let owner = hosted
            .members
            .iter()
            .find(|member| member.id == "host-account")
            .unwrap();
        assert!(owner.owner);
        assert_eq!(owner.account_id, "host-account");

        let _ = std::fs::remove_dir_all(data_dir);
    }
}
