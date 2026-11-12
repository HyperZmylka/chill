use std::collections::HashSet;

use serde_json::{json, Value};
use subtle::ConstantTimeEq;

use crate::model::*;
use crate::state::*;

pub struct BridgeContext {
    pub public: bool,
    pub origin: String,
    pub secure: bool,
    pub token: String,
    pub user: Option<Account>,
}

pub struct BridgeReply {
    pub result: Result<Value, String>,
    pub cookies: Vec<String>,
}

impl BridgeReply {
    fn ok(value: Value) -> Self {
        Self {
            result: Ok(value),
            cookies: Vec::new(),
        }
    }

    fn err(message: &str) -> Self {
        Self {
            result: Err(message.to_string()),
            cookies: Vec::new(),
        }
    }
}

pub fn dispatch(
    state: &AppState,
    ctx: &mut BridgeContext,
    channel: &str,
    payload: &Value,
) -> BridgeReply {
    match channel {
        "chill:auth-session" => {
            let user = current_user(state, ctx);
            BridgeReply::ok(json!({
                "ok": true,
                "user": user.map(|account| account.public_value()),
            }))
        }
        "chill:auth-register" => auth_register(state, ctx, payload),
        "chill:auth-login" => auth_login(state, ctx, payload),
        "chill:auth-logout" => auth_logout(state, ctx),
        "chill:auth-update-profile" => auth_update_profile(state, ctx, payload),
        "chill:auth-change-password" => auth_change_password(state, ctx, payload),
        "chill:servers-list" => servers_list(state, ctx),
        "chill:servers-create" => servers_create(state, ctx, payload),
        "chill:servers-save-joined" => servers_save_joined(state, ctx, payload),
        "chill:servers-leave" => servers_leave(state, ctx, payload),
        "chill:servers-invite" => servers_invite(state, ctx, payload),
        "chill:app-version" => BridgeReply::ok(json!(state.cfg.version)),
        "chill:update-check" => BridgeReply::ok(Value::Null),
        channel if channel.starts_with("chill:discord-") => BridgeReply::ok(json!({
            "ok": false,
            "error": if ctx.public {
                "Import z Discorda jest dostępny tylko w aplikacji desktopowej."
            } else {
                "Import z Discorda nie jest dostępny w tej wersji."
            },
        })),
        _ => BridgeReply::err("Nieznana operacja."),
    }
}

fn current_user(state: &AppState, ctx: &BridgeContext) -> Option<Account> {
    if ctx.public {
        if let Some(user) = &ctx.user {
            return state.find_user(&user.id);
        }
        return None;
    }
    state.active_session_user()
}

fn require_user(state: &AppState, ctx: &BridgeContext) -> Result<Account, String> {
    current_user(state, ctx).ok_or_else(|| "Sesja wygasła. Zaloguj się ponownie.".to_string())
}

fn field(payload: &Value, key: &str) -> String {
    payload
        .get(key)
        .map(value_to_string)
        .unwrap_or_default()
}

fn field_bool(payload: &Value, key: &str) -> bool {
    payload
        .get(key)
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn cookie_flags(secure: bool, http_only: bool) -> String {
    let mut flags = String::new();
    if http_only {
        flags.push_str("; HttpOnly");
    }
    flags.push_str("; Path=/; SameSite=Lax");
    if secure {
        flags.push_str("; Secure");
    }
    flags
}

fn session_cookie(token: &str, remember: bool, secure: bool) -> String {
    let max_age = if remember {
        format!("; Max-Age={}", WEB_SESSION_REMEMBER_TTL / 1000)
    } else {
        String::new()
    };
    format!(
        "chill_sid={}{}{}",
        token,
        cookie_flags(secure, true),
        max_age
    )
}

fn clear_session_cookie(secure: bool) -> String {
    format!("chill_sid={}; Max-Age=0", cookie_flags(secure, true))
}

fn hash_password(password: &str, salt: Option<String>) -> Result<(String, String), String> {
    let salt = salt.unwrap_or_else(|| random_hex(16));
    let params = scrypt::Params::new(14, 8, 1, 64).map_err(|_| "Nie udało się utworzyć hasła.".to_string())?;
    let mut output = [0u8; 64];
    scrypt::scrypt(password.as_bytes(), salt.as_bytes(), &params, &mut output)
        .map_err(|_| "Nie udało się utworzyć hasła.".to_string())?;
    Ok((salt, hex::encode(output)))
}

fn verify_password(password: &str, salt: &str, hash: &str) -> bool {
    let Ok(expected) = hex::decode(hash) else {
        return false;
    };
    let Ok(params) = scrypt::Params::new(14, 8, 1, 64) else {
        return false;
    };
    let mut output = [0u8; 64];
    if scrypt::scrypt(password.as_bytes(), salt.as_bytes(), &params, &mut output).is_err() {
        return false;
    }
    expected.len() == output.len() && bool::from(output.ct_eq(&expected))
}

fn auth_register(state: &AppState, ctx: &mut BridgeContext, payload: &Value) -> BridgeReply {
    let email = field(payload, "email").trim().to_lowercase();
    let username = field(payload, "username").trim().to_string();
    let mut display_name = field(payload, "displayName").trim().to_string();
    if display_name.is_empty() {
        display_name = username.clone();
    }
    let password = field(payload, "password");
    let color = {
        let value = field(payload, "color");
        if is_valid_hex(&value) {
            value.to_lowercase()
        } else {
            "#3ee0a3".to_string()
        }
    };

    if !email.is_empty() && !valid_email(&email) {
        return BridgeReply::err("Podaj poprawny adres e-mail lub zostaw pole puste.");
    }
    if email.len() > 254 {
        return BridgeReply::err("Adres e-mail jest zbyt długi.");
    }
    if !valid_username(&username) {
        return BridgeReply::err("Nazwa użytkownika: 3–20 znaków (litery, cyfry, _ i .).");
    }
    if display_name.chars().count() < 2 || display_name.chars().count() > 32 {
        return BridgeReply::err("Nazwa wyświetlana musi mieć 2–32 znaki.");
    }
    if password.chars().count() < 8 {
        return BridgeReply::err("Hasło musi mieć co najmniej 8 znaków.");
    }
    if password.chars().count() > 128 {
        return BridgeReply::err("Hasło jest zbyt długie.");
    }

    {
        let store = state.accounts.read();
        if !email.is_empty()
            && store
                .users
                .iter()
                .any(|user| !user.email.is_empty() && user.email.to_lowercase() == email)
        {
            return BridgeReply::err("Konto z tym adresem e-mail już istnieje.");
        }
        if store
            .users
            .iter()
            .any(|user| user.username.to_lowercase() == username.to_lowercase())
        {
            return BridgeReply::err("Ta nazwa użytkownika jest już zajęta.");
        }
    }

    let Ok((salt, hash)) = hash_password(&password, None) else {
        return BridgeReply::err("Nie udało się utworzyć konta.");
    };
    let id = random_uuid();
    let account = Account {
        id: id.clone(),
        email,
        username: username.clone(),
        display_name: take_chars(&display_name, 32),
        handle: handle_for_account(&id, &username, ""),
        color,
        about: String::new(),
        avatar: String::new(),
        banner: default_banner(),
        badges: vec!["piwo".to_string()],
        games: Vec::new(),
        salt,
        hash,
        created_at: now_ms(),
    };
    {
        let mut store = state.accounts.write();
        store.users.push(account.clone());
    }
    state.save_accounts();

    let mut reply = BridgeReply::ok(json!({ "ok": true }));
    if ctx.public {
        let token = state.create_web_session(&account.id, true);
        ctx.token = token.clone();
        reply.cookies.push(session_cookie(&token, true, ctx.secure));
    } else {
        state.set_account_session(&account.id, true);
    }
    ctx.user = Some(account.clone());
    reply.result = Ok(json!({ "ok": true, "user": account.public_value() }));
    reply
}

fn auth_login(state: &AppState, ctx: &mut BridgeContext, payload: &Value) -> BridgeReply {
    let identifier = field(payload, "identifier").trim().to_lowercase();
    let password = field(payload, "password");
    let remember = field_bool(payload, "remember");

    if identifier.is_empty() || password.is_empty() {
        return BridgeReply::err("Podaj login i hasło.");
    }
    let lock = state.login_lock_remaining(&identifier);
    if lock > 0 {
        let seconds = (lock + 999) / 1000;
        return BridgeReply::err(&format!(
            "Zbyt wiele prób. Spróbuj ponownie za {} s.",
            seconds
        ));
    }
    let Some(account) = state.find_user_by_identifier(&identifier) else {
        state.note_failed_login(&identifier);
        return BridgeReply::err("Nieprawidłowy login lub hasło.");
    };
    if !verify_password(&password, &account.salt, &account.hash) {
        state.note_failed_login(&identifier);
        return BridgeReply::err("Nieprawidłowy login lub hasło.");
    }
    state.clear_login_attempts(&identifier);

    let mut reply = BridgeReply::ok(json!({ "ok": true }));
    if ctx.public {
        let token = state.create_web_session(&account.id, remember);
        ctx.token = token.clone();
        reply.cookies.push(session_cookie(&token, remember, ctx.secure));
    } else {
        state.set_account_session(&account.id, remember);
    }
    ctx.user = Some(account.clone());
    reply.result = Ok(json!({ "ok": true, "user": account.public_value() }));
    reply
}

fn auth_logout(state: &AppState, ctx: &mut BridgeContext) -> BridgeReply {
    let mut reply = BridgeReply::ok(json!({ "ok": true }));
    if ctx.public {
        if !ctx.token.is_empty() {
            state.destroy_web_session(&ctx.token);
        }
        ctx.token.clear();
        reply.cookies.push(clear_session_cookie(ctx.secure));
    } else {
        state.clear_account_session();
    }
    ctx.user = None;
    reply
}

fn auth_update_profile(state: &AppState, ctx: &mut BridgeContext, payload: &Value) -> BridgeReply {
    let Ok(current) = require_user(state, ctx) else {
        return BridgeReply::err("Sesja wygasła. Zaloguj się ponownie.");
    };
    let Some(account) = state.find_user(&current.id) else {
        return BridgeReply::err("Konto nie istnieje.");
    };

    let display_name = field(payload, "displayName").trim().to_string();
    let about = field(payload, "about").trim().to_string();
    let color = field(payload, "color");

    if display_name.chars().count() < 2 || display_name.chars().count() > 32 {
        return BridgeReply::err("Nazwa musi mieć 2–32 znaki.");
    }
    if about.chars().count() > 160 {
        return BridgeReply::err("Opis może mieć maksymalnie 160 znaków.");
    }
    if !is_valid_hex(&color) {
        return BridgeReply::err("Wybierz poprawny kolor.");
    }

    let mut avatar = sanitize_avatar(&account.avatar);
    if let Some(value) = payload.get("avatar") {
        let raw = value_to_string(value);
        avatar = sanitize_avatar(&raw);
        if !raw.is_empty() && avatar.is_empty() {
            return BridgeReply::err("Nieprawidłowy avatar.");
        }
    }

    let mut banner = sanitize_banner(&account.banner);
    if let Some(value) = payload.get("banner") {
        banner = sanitize_banner(value);
    }

    let mut badges = sanitize_badges(
        &Value::Array(account.badges.iter().cloned().map(Value::String).collect()),
        &["piwo"],
    );
    if let Some(value) = payload.get("badges") {
        if !value.is_array() {
            return BridgeReply::err("Nieprawidłowe odznaki.");
        }
        badges = sanitize_badges(value, &[]);
    }

    let mut games = account.games.clone();
    if let Some(value) = payload.get("games") {
        if !value.is_array() {
            return BridgeReply::err("Nieprawidłowa kolekcja gier.");
        }
        games = sanitize_games(value);
    }

    let handle = handle_for_account(&account.id, &account.username, &account.handle);
    {
        let mut store = state.accounts.write();
        let Some(user) = store.users.iter_mut().find(|user| user.id == account.id) else {
            return BridgeReply::err("Konto nie istnieje.");
        };
        user.display_name = display_name.clone();
        user.about = about.clone();
        user.color = color.clone();
        user.handle = handle.clone();
        user.avatar = avatar.clone();
        user.banner = banner.clone();
        user.badges = badges.clone();
        user.games = games.clone();
    }
    state.save_accounts();

    state.update_online(&account.id, |live| {
        live.name = display_name.clone();
        live.color = color.clone();
        live.handle = handle.clone();
    });

    let mut updated_servers: Vec<Server> = Vec::new();
    {
        let mut store = state.servers.write();
        for server in &mut store.hosted {
            let mut touched = false;
            for member in &mut server.members {
                if member.id != account.id {
                    continue;
                }
                member.name = display_name.clone();
                member.color = color.clone();
                member.handle = handle.clone();
                member.avatar = avatar.clone();
                member.banner = banner.clone();
                member.badges = badges.clone();
                member.games = games.clone();
                member.last_seen = now_ms();
                touched = true;
            }
            if touched {
                updated_servers.push(server.clone());
            }
        }
    }
    if !updated_servers.is_empty() {
        state.save_servers();
        for server in updated_servers {
            state.broadcast_server_members(&server);
        }
    }

    let updated = state.find_user(&account.id).unwrap_or(account);
    BridgeReply::ok(json!({ "ok": true, "user": updated.public_value() }))
}

fn auth_change_password(state: &AppState, ctx: &mut BridgeContext, payload: &Value) -> BridgeReply {
    let Ok(current) = require_user(state, ctx) else {
        return BridgeReply::err("Sesja wygasła. Zaloguj się ponownie.");
    };
    let Some(account) = state.find_user(&current.id) else {
        return BridgeReply::err("Konto nie istnieje.");
    };
    let current_password = field(payload, "currentPassword");
    let new_password = field(payload, "newPassword");
    if !verify_password(&current_password, &account.salt, &account.hash) {
        return BridgeReply::err("Obecne hasło jest nieprawidłowe.");
    }
    if new_password.chars().count() < 8 {
        return BridgeReply::err("Nowe hasło musi mieć co najmniej 8 znaków.");
    }
    if new_password.chars().count() > 128 {
        return BridgeReply::err("Nowe hasło jest zbyt długie.");
    }
    let Ok((salt, hash)) = hash_password(&new_password, None) else {
        return BridgeReply::err("Nie udało się zmienić hasła.");
    };
    {
        let mut store = state.accounts.write();
        if let Some(user) = store.users.iter_mut().find(|user| user.id == account.id) {
            user.salt = salt;
            user.hash = hash;
        }
    }
    state.save_accounts();
    state.destroy_user_web_sessions(&account.id, &ctx.token);
    BridgeReply::ok(json!({ "ok": true }))
}

fn server_public_info(server: &Server) -> Value {
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

fn origin_address(origin: &str) -> String {
    if let Ok(url) = url::Url::parse(origin) {
        let host = url.host_str().unwrap_or("127.0.0.1");
        let port = url.port_or_known_default().unwrap_or(80);
        return format!("{}:{}", host, port);
    }
    "127.0.0.1:47830".to_string()
}

fn lan_address() -> String {
    use std::net::UdpSocket;
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(address) = socket.local_addr() {
                return address.ip().to_string();
            }
        }
    }
    "127.0.0.1".to_string()
}

fn hosted_share_link(state: &AppState, server: &Server, ctx: &BridgeContext) -> String {
    if state.cfg.public_web {
        let origin = if ctx.origin.is_empty() {
            state.cfg.origin()
        } else {
            ctx.origin.clone()
        };
        format!("{}/?invite={}", origin, server.invite)
    } else {
        format!(
            "chill://{}:{}/{}",
            lan_address(),
            state.cfg.port,
            server.invite
        )
    }
}

fn joined_share_link(state: &AppState, entry: &JoinedEntry, ctx: &BridgeContext) -> String {
    if state.cfg.public_web {
        let origin = if ctx.origin.is_empty() {
            state.cfg.origin()
        } else {
            ctx.origin.clone()
        };
        format!("{}/?invite={}", origin, entry.invite)
    } else {
        format!(
            "chill://{}/{}{}",
            entry.address,
            entry.invite,
            if entry.secure { "?tls=1" } else { "" }
        )
    }
}

fn hosted_membership(state: &AppState, server: &Server, user_id: &str, ctx: &BridgeContext) -> Value {
    let web_origin = if state.cfg.public_web {
        Some(if ctx.origin.is_empty() {
            state.cfg.origin()
        } else {
            ctx.origin.clone()
        })
    } else {
        None
    };
    let address = web_origin
        .as_ref()
        .map(|origin| origin_address(origin))
        .unwrap_or_else(|| format!("127.0.0.1:{}", state.cfg.port));
    let secure = web_origin
        .as_ref()
        .map(|origin| origin.starts_with("https://"))
        .unwrap_or(false);
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
        "owner": true,
        "ownerId": server.owner_id,
        "address": address,
        "secure": secure,
        "invite": server.invite,
        "shareLink": hosted_share_link(state, server, ctx),
        "channels": server.channels.iter().map(|channel| json!({
            "id": channel.id,
            "name": channel.name,
            "type": channel.channel_type,
            "createdAt": channel.created_at,
        })).collect::<Vec<Value>>(),
        "ownerKey": server.owner_key,
        "memberId": user_id,
        "createdAt": server.created_at,
    })
}

fn joined_membership(state: &AppState, entry: &JoinedEntry, ctx: &BridgeContext) -> Value {
    let web_origin = if state.cfg.public_web {
        Some(if ctx.origin.is_empty() {
            state.cfg.origin()
        } else {
            ctx.origin.clone()
        })
    } else {
        None
    };
    let address = web_origin
        .as_ref()
        .map(|origin| origin_address(origin))
        .unwrap_or_else(|| entry.address.clone());
    let secure = web_origin
        .as_ref()
        .map(|origin| origin.starts_with("https://"))
        .unwrap_or(entry.secure);
    json!({
        "id": entry.id,
        "name": entry.name,
        "icon": entry.icon,
        "color": entry.color,
        "tag": take_chars(&entry.tag.to_uppercase().chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>(), 8),
        "banner": sanitize_server_banner(&entry.banner),
        "description": sanitize_server_description(&entry.description),
        "traits": sanitize_server_text_list(&json!(entry.traits), SERVER_TRAIT_LIMIT, SERVER_TRAIT_LENGTH),
        "games": sanitize_server_text_list(&json!(entry.games), SERVER_GAME_LIMIT, SERVER_GAME_LENGTH),
        "owner": false,
        "address": address,
        "secure": secure,
        "invite": entry.invite,
        "shareLink": joined_share_link(state, entry, ctx),
        "memberId": entry.member_id,
        "joinedAt": entry.joined_at,
    })
}

fn servers_list(state: &AppState, ctx: &BridgeContext) -> BridgeReply {
    let Ok(user) = require_user(state, ctx) else {
        return BridgeReply::ok(json!({
            "ok": false,
            "error": "Sesja wygasła. Zaloguj się ponownie.",
            "servers": [],
        }));
    };
    let hosted = state.hosted_by_owner(&user.id);
    let hosted_ids: HashSet<String> = hosted.iter().map(|server| server.id.clone()).collect();
    let mut list: Vec<Value> = hosted
        .iter()
        .map(|server| hosted_membership(state, server, &user.id, ctx))
        .collect();
    for entry in state.joined_for_user(&user.id) {
        if !hosted_ids.contains(&entry.id) {
            list.push(joined_membership(state, &entry, ctx));
        }
    }
    BridgeReply::ok(json!({ "ok": true, "servers": list }))
}

fn servers_create(state: &AppState, ctx: &BridgeContext, payload: &Value) -> BridgeReply {
    let Ok(user) = require_user(state, ctx) else {
        return BridgeReply::err("Sesja wygasła. Zaloguj się ponownie.");
    };
    let name = field(payload, "name").trim().to_string();
    let color = {
        let value = field(payload, "color");
        if is_valid_hex(&value) {
            value.to_lowercase()
        } else {
            "#3ee0a3".to_string()
        }
    };
    let icon = take_chars(&field(payload, "icon").trim(), 4);
    if name.chars().count() < 2 || name.chars().count() > 40 {
        return BridgeReply::err("Nazwa serwera musi mieć 2–40 znaków.");
    }
    let channel_name = {
        let raw = field(payload, "channelName");
        let raw = if raw.trim().is_empty() {
            "ogólny".to_string()
        } else {
            raw
        };
        let cleaned = sanitize_channel_name(&raw);
        if cleaned.is_empty() {
            "ogólny".to_string()
        } else {
            cleaned
        }
    };

    let mut server = Server {
        id: random_hex(8),
        owner_id: user.id.clone(),
        name,
        icon,
        color,
        tag: String::new(),
        invite: String::new(),
        owner_key: random_hex(24),
        created_at: now_ms(),
        banner: "graphite".to_string(),
        description: String::new(),
        traits: Vec::new(),
        games: Vec::new(),
        channels: vec![Channel {
            id: make_channel_id(),
            name: channel_name,
            channel_type: "text".to_string(),
            created_at: now_ms(),
        }],
        members: Vec::new(),
        messages: Default::default(),
        dms: Default::default(),
    };
    server
        .messages
        .insert(server.channels[0].id.clone(), Vec::new());
    {
        let mut store = state.servers.write();
        server.invite = unique_invite(&store);
        store.hosted.push(server.clone());
    }
    state.save_servers();
    BridgeReply::ok(json!({
        "ok": true,
        "server": hosted_membership(state, &server, &user.id, ctx),
    }))
}

fn servers_save_joined(state: &AppState, ctx: &BridgeContext, payload: &Value) -> BridgeReply {
    let Ok(user) = require_user(state, ctx) else {
        return BridgeReply::err("Sesja wygasła. Zaloguj się ponownie.");
    };
    let incoming = payload.get("server").cloned().unwrap_or_else(|| json!({}));
    let id = field(&incoming, "id").trim().to_string();
    let address = field(payload, "address").trim().to_string();
    let invite = field(payload, "invite").trim().to_uppercase();
    if id.len() < 6 || id.len() > 80 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return BridgeReply::err("Serwer przesłał nieprawidłowy identyfikator.");
    }
    if address.is_empty() || !address.contains(':') {
        return BridgeReply::err("Nieprawidłowy adres serwera.");
    }
    let port_ok = address
        .rsplit(':')
        .next()
        .and_then(|port| port.parse::<u16>().ok())
        .map(|port| port >= 10)
        .unwrap_or(false);
    if !port_ok
        || !address
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | ':'))
    {
        return BridgeReply::err("Nieprawidłowy adres serwera.");
    }
    if invite.len() < 4 || invite.len() > 16 || !invite.chars().all(|c| c.is_ascii_alphanumeric()) {
        return BridgeReply::err("Nieprawidłowy kod zaproszenia.");
    }

    if let Some(owned) = state
        .hosted_by_owner(&user.id)
        .into_iter()
        .find(|server| server.id == id)
    {
        return BridgeReply::ok(json!({
            "ok": true,
            "server": hosted_membership(state, &owned, &user.id, ctx),
        }));
    }

    let public_address = if state.cfg.public_web {
        let origin = if ctx.origin.is_empty() {
            state.cfg.origin()
        } else {
            ctx.origin.clone()
        };
        origin_address(&origin)
    } else {
        String::new()
    };
    let name = {
        let raw = field(&incoming, "name");
        let value = take_chars(raw.trim(), 40);
        if value.is_empty() {
            "Serwer".to_string()
        } else {
            value
        }
    };
    let color = {
        let value = field(&incoming, "color");
        if is_valid_hex(&value) {
            value.to_lowercase()
        } else {
            "#3ee0a3".to_string()
        }
    };
    let icon = take_chars(&field(&incoming, "icon").trim(), 4);
    let tag = take_chars(
        &field(&incoming, "tag")
            .to_uppercase()
            .chars()
            .filter(|c| c.is_ascii_alphanumeric())
            .collect::<String>(),
        8,
    );
    let banner = sanitize_server_banner(incoming.get("banner").unwrap_or(&Value::Null));
    let description = sanitize_server_description(&field(&incoming, "description"));
    let traits = sanitize_server_text_list(
        incoming.get("traits").unwrap_or(&Value::Null),
        SERVER_TRAIT_LIMIT,
        SERVER_TRAIT_LENGTH,
    );
    let games_list = sanitize_server_text_list(
        incoming.get("games").unwrap_or(&Value::Null),
        SERVER_GAME_LIMIT,
        SERVER_GAME_LENGTH,
    );

    let mut entry;
    {
        let mut store = state.servers.write();
        let existing = store
            .joined
            .iter()
            .find(|item| item.user_id == user.id && item.id == id)
            .cloned();
        entry = existing.unwrap_or_else(|| JoinedEntry {
            user_id: user.id.clone(),
            id: id.clone(),
            joined_at: now_ms(),
            member_id: String::new(),
            ..Default::default()
        });
        entry.address = if public_address.is_empty() {
            address.clone()
        } else {
            public_address.clone()
        };
        entry.secure = if !public_address.is_empty() {
            ctx.origin.starts_with("https://")
        } else {
            field_bool(payload, "secure")
        };
        entry.invite = invite;
        entry.name = name;
        entry.color = color;
        entry.icon = icon;
        entry.tag = tag;
        entry.banner = Value::String(banner);
        entry.description = description;
        entry.traits = traits;
        entry.games = games_list;
        if state.cfg.public_web {
            entry.member_id = user.id.clone();
        } else {
            let requested = field(payload, "memberId")
                .chars()
                .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
                .take(64)
                .collect::<String>();
            entry.member_id = if !requested.is_empty() {
                requested
            } else if !entry.member_id.is_empty() {
                entry.member_id.clone()
            } else {
                random_uuid()
            };
        }
        if entry.joined_at == 0 {
            entry.joined_at = now_ms();
        }
        let exists = store
            .joined
            .iter()
            .any(|item| item.user_id == user.id && item.id == id);
        if exists {
            if let Some(slot) = store
                .joined
                .iter_mut()
                .find(|item| item.user_id == user.id && item.id == id)
            {
                *slot = entry.clone();
            }
        } else {
            store.joined.push(entry.clone());
        }
    }
    state.save_servers();
    BridgeReply::ok(json!({
        "ok": true,
        "server": joined_membership(state, &entry, ctx),
    }))
}

fn servers_leave(state: &AppState, ctx: &BridgeContext, payload: &Value) -> BridgeReply {
    let Ok(user) = require_user(state, ctx) else {
        return BridgeReply::err("Sesja wygasła. Zaloguj się ponownie.");
    };
    let id = field(payload, "id").trim().to_string();
    if id.is_empty() {
        return BridgeReply::err("Nie wskazano serwera.");
    }

    let removed_server;
    {
        let mut store = state.servers.write();
        let hosted_index = store
            .hosted
            .iter()
            .position(|server| server.id == id && server.owner_id == user.id);
        if let Some(index) = hosted_index {
            removed_server = Some(store.hosted.remove(index));
            store.joined.retain(|entry| entry.id != id);
        } else {
            removed_server = None;
            let before = store.joined.len();
            store
                .joined
                .retain(|entry| !(entry.user_id == user.id && entry.id == id));
            if store.joined.len() == before {
                return BridgeReply::err("Nie należysz do tego serwera.");
            }
        }
    }
    state.save_servers();

    if let Some(server) = removed_server {
        state.close_server_sessions(&server.id, json!({ "type": "server:deleted", "serverId": server.id }));
        let mut messages: Vec<Message> = Vec::new();
        for list in server.messages.values() {
            messages.extend(list.iter().cloned());
        }
        for list in server.dms.values() {
            messages.extend(list.iter().cloned());
        }
        state.remove_voice_from_messages(&messages);
        return BridgeReply::ok(json!({ "ok": true, "deleted": true }));
    }
    BridgeReply::ok(json!({ "ok": true, "deleted": false }))
}

fn servers_invite(state: &AppState, ctx: &BridgeContext, payload: &Value) -> BridgeReply {
    let Ok(user) = require_user(state, ctx) else {
        return BridgeReply::err("Sesja wygasła. Zaloguj się ponownie.");
    };
    let id = field(payload, "id").trim().to_string();
    if let Some(hosted) = state
        .hosted_by_owner(&user.id)
        .into_iter()
        .find(|server| server.id == id)
    {
        return BridgeReply::ok(json!({
            "ok": true,
            "shareLink": hosted_share_link(state, &hosted, ctx),
            "invite": hosted.invite,
            "internet": state.cfg.public_web,
            "tunnelError": "",
        }));
    }
    let Some(entry) = state
        .joined_for_user(&user.id)
        .into_iter()
        .find(|entry| entry.id == id)
    else {
        return BridgeReply::err("Nie znaleziono serwera.");
    };
    let secure = if state.cfg.public_web {
        ctx.origin.starts_with("https://")
    } else {
        entry.secure
    };
    BridgeReply::ok(json!({
        "ok": true,
        "shareLink": joined_share_link(state, &entry, ctx),
        "invite": entry.invite,
        "internet": state.cfg.public_web || secure,
        "secure": secure,
    }))
}
