// Chill - komunikator desktopowy
// Konta lokalne, czat WebSocket, automatyczne aktualizacje z GitHub Releases
const { app, BrowserWindow, Menu, Tray, nativeImage, shell, session, desktopCapturer, ipcMain, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { WebSocketServer } = require('ws');
const {
  MAX_IMPORTED_CHANNELS,
  buildAuthorizationUrl,
  filterOwnedGuilds,
  mapTemplateChannels,
  normalizeServerName,
  parseTemplateCode,
} = require('./discord-import');
const voiceMessages = require('./voice');

app.setName('Chill');

if (process.env.CHILL_DATA_DIR) {
  try {
    app.setPath('userData', path.resolve(process.env.CHILL_DATA_DIR));
  } catch (err) {
    console.error('[chill] Nie udało się ustawić folderu danych:', err.message);
  }
}

const ICON = path.join(__dirname, 'build', 'icon.png');
const CHAT_PORT = Number(process.env.CHILL_PORT) || 47830;

// ================= KONFIGURACJA GITHUB =================
const GITHUB_REPO = 'HyperZmylka/chill';
// =======================================================

const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1']);

let win = null;
let tray = null;
let quitting = false;
let updateReady = null;
let updateInfo = null;
let updateCheckInterval = null;
let wss = null;
let httpServer = null;

// ---------- Ścieżki danych ----------
function dataDir() {
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
const accountsPath = () => path.join(dataDir(), 'accounts.json');
const chatDataPath = () => path.join(dataDir(), 'chat-data.json');
const serversPath = () => path.join(dataDir(), 'servers.json');
const languagePath = () => path.join(dataDir(), 'language.json');
const discordPath = () => path.join(dataDir(), 'discord.json');
const voiceDir = () => path.join(dataDir(), 'voice');
const voiceIndexPath = () => path.join(voiceDir(), 'index.json');

let appLanguage = null;

function loadAppLanguage() {
  if (appLanguage) return appLanguage;
  try {
    const saved = JSON.parse(fs.readFileSync(languagePath(), 'utf8'));
    appLanguage = saved.lang === 'en' ? 'en' : 'pl';
  } catch {
    appLanguage = 'pl';
  }
  return appLanguage;
}

function saveAppLanguage(lang) {
  appLanguage = lang === 'en' ? 'en' : 'pl';
  try {
    fs.writeFileSync(languagePath(), JSON.stringify({ lang: appLanguage }), 'utf8');
  } catch (err) {
    console.error('[chill] Nie udało się zapisać języka:', err.message);
  }
}

// ---------- Konta ----------
let accountStore = null;
let volatileSession = null;

function loadAccounts() {
  if (accountStore) return accountStore;
  try {
    accountStore = JSON.parse(fs.readFileSync(accountsPath(), 'utf8'));
  } catch {
    accountStore = {};
  }
  if (!Array.isArray(accountStore.users)) accountStore.users = [];
  if (!accountStore.session || typeof accountStore.session !== 'object') accountStore.session = null;
  return accountStore;
}

function saveAccounts() {
  try {
    fs.writeFileSync(accountsPath(), JSON.stringify(accountStore, null, 2), 'utf8');
  } catch (err) {
    console.error('[auth] Nie udało się zapisać kont:', err.message);
  }
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email || '',
    username: u.username,
    displayName: u.displayName || u.username,
    color: u.color || '#3ee0a3',
    about: u.about || '',
    createdAt: u.createdAt,
  };
}

function findUserById(id) {
  return loadAccounts().users.find((u) => u.id === id) || null;
}

function findUserByIdentifier(identifier) {
  const value = String(identifier || '').trim().toLowerCase();
  return loadAccounts().users.find((u) => (u.email && u.email.toLowerCase() === value) || (u.username && u.username.toLowerCase() === value)) || null;
}

function allPublicUsers() {
  return loadAccounts().users.map(publicUser);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  try {
    const candidate = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return expected.length === candidate.length && crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

function issueSession(user, remember) {
  const record = { token: crypto.randomBytes(32).toString('hex'), userId: user.id, createdAt: Date.now() };
  if (remember) {
    loadAccounts().session = record;
    saveAccounts();
    volatileSession = null;
  } else {
    volatileSession = record;
  }
  return publicUser(user);
}

function activeSession() {
  const record = loadAccounts().session || volatileSession;
  if (!record) return null;
  const user = findUserById(record.userId);
  if (!user) {
    loadAccounts().session = null;
    saveAccounts();
    volatileSession = null;
    return null;
  }
  return publicUser(user);
}

// Ograniczenie prób logowania
const loginAttempts = new Map();
function loginLockRemaining(key) {
  const entry = loginAttempts.get(key);
  if (!entry) return 0;
  if (entry.until && entry.until > Date.now()) return entry.until - Date.now();
  if (entry.until && entry.until <= Date.now()) loginAttempts.delete(key);
  return 0;
}
function noteFailedLogin(key) {
  const entry = loginAttempts.get(key) || { count: 0, until: 0 };
  entry.count += 1;
  if (entry.count >= 5) {
    entry.until = Date.now() + 60_000;
    entry.count = 0;
  }
  loginAttempts.set(key, entry);
}
function clearLoginAttempts(key) {
  loginAttempts.delete(key);
}

// ---------- Historia czatu ----------
let chatStore = null;
let chatSaveTimer = null;

function loadChatStore() {
  if (chatStore) return chatStore;
  try {
    chatStore = JSON.parse(fs.readFileSync(chatDataPath(), 'utf8'));
  } catch {
    chatStore = {};
  }
  if (!chatStore.rooms || typeof chatStore.rooms !== 'object') chatStore.rooms = {};
  if (!chatStore.dms || typeof chatStore.dms !== 'object') chatStore.dms = {};
  return chatStore;
}

function scheduleChatSave() {
  clearTimeout(chatSaveTimer);
  chatSaveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(chatDataPath(), JSON.stringify(chatStore), 'utf8');
    } catch (err) {
      console.error('[chat] Nie udało się zapisać historii:', err.message);
    }
  }, 400);
}

function dmKey(a, b) {
  return [String(a), String(b)].sort().join('|');
}

// ---------- Użytkownicy online ----------
const users = new Map();
const userSockets = new Map();
const serverSessions = new Map();

// ---------- Serwery (kanały + zaproszenia) ----------
let serversStore = null;
let serversSaveTimer = null;
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeServerId() {
  return crypto.randomBytes(8).toString('hex');
}

function makeInviteCode() {
  let out = '';
  for (let i = 0; i < 6; i++) out += INVITE_ALPHABET[crypto.randomInt(INVITE_ALPHABET.length)];
  return out;
}

function makeChannelId() {
  return crypto.randomBytes(6).toString('hex');
}

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const entry of list || []) {
      if (entry && entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return '127.0.0.1';
}

function normalizeHostedServer(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id || !raw.ownerId) return null;
  const server = raw;
  server.name = String(server.name || 'Serwer').trim().slice(0, 40) || 'Serwer';
  server.icon = typeof server.icon === 'string' ? server.icon.slice(0, 4) : '';
  server.color = /^#[0-9a-f]{6}$/i.test(String(server.color || '')) ? server.color : '#3ee0a3';
  server.invite = /^[A-Z0-9]{4,12}$/.test(String(server.invite || '')) ? server.invite : makeInviteCode();
  server.ownerKey = typeof server.ownerKey === 'string' && server.ownerKey.length >= 24 ? server.ownerKey : crypto.randomBytes(24).toString('hex');
  server.createdAt = Number(server.createdAt) || Date.now();
  if (!Array.isArray(server.channels)) server.channels = [];
  server.channels = server.channels
    .filter((channel) => channel && channel.id && channel.name)
    .map((channel) => ({
      id: String(channel.id),
      name: String(channel.name).trim().slice(0, 32) || 'kanał',
      type: channel.type === 'voice' ? 'voice' : 'text',
      createdAt: Number(channel.createdAt) || Date.now(),
    }));
  if (!Array.isArray(server.members)) server.members = [];
  server.members = server.members
    .filter((member) => member && member.id)
    .map((member) => ({
      id: String(member.id).slice(0, 64),
      name: String(member.name || 'Gość').trim().slice(0, 32) || 'Gość',
      color: /^#[0-9a-f]{6}$/i.test(String(member.color || '')) ? member.color : '#3ee0a3',
      owner: Boolean(member.owner),
      joinedAt: Number(member.joinedAt) || Date.now(),
      lastSeen: Number(member.lastSeen) || Number(member.joinedAt) || Date.now(),
    }));
  if (!server.messages || typeof server.messages !== 'object') server.messages = {};
  for (const channel of server.channels) {
    const list = Array.isArray(server.messages[channel.id]) ? server.messages[channel.id] : [];
    server.messages[channel.id] = list.slice(-300);
  }
  if (!server.dms || typeof server.dms !== 'object') server.dms = {};
  for (const [key, list] of Object.entries(server.dms)) {
    const parts = String(key).split('|');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      delete server.dms[key];
      continue;
    }
    server.dms[key] = Array.isArray(list) ? list.slice(-500) : [];
  }
  return server;
}

function loadServersStore() {
  if (serversStore) return serversStore;
  try {
    serversStore = JSON.parse(fs.readFileSync(serversPath(), 'utf8'));
  } catch {
    serversStore = {};
  }
  if (!Array.isArray(serversStore.hosted)) serversStore.hosted = [];
  if (!Array.isArray(serversStore.joined)) serversStore.joined = [];
  serversStore.hosted = serversStore.hosted.map(normalizeHostedServer).filter(Boolean);
  serversStore.joined = serversStore.joined.filter((entry) => entry && entry.id && entry.userId && entry.address && entry.invite);
  return serversStore;
}

function persistServersStore() {
  fs.writeFileSync(serversPath(), JSON.stringify(serversStore, null, 2), 'utf8');
}

function saveServersStore() {
  try {
    persistServersStore();
  } catch (err) {
    console.error('[servers] Nie udało się zapisać serwerów:', err.message);
  }
}

function scheduleServersSave() {
  clearTimeout(serversSaveTimer);
  serversSaveTimer = setTimeout(saveServersStore, 400);
}

function findHostedServer(id) {
  return loadServersStore().hosted.find((server) => server.id === id) || null;
}

// ---------- Wiadomości głosowe ----------
let voiceStore = null;
const voiceTokens = new Map();
const VOICE_TOKEN_TTL = 7 * 24 * 60 * 60 * 1000;

function loadVoiceStore() {
  if (voiceStore) return voiceStore;
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(voiceIndexPath(), 'utf8'));
  } catch {
    raw = null;
  }
  const items = {};
  if (raw && typeof raw === 'object' && raw.items && typeof raw.items === 'object') {
    for (const [id, item] of Object.entries(raw.items)) {
      if (!voiceMessages.isValidId(id) || !item || typeof item !== 'object') continue;
      const scope = String(item.scope || '');
      if (scope !== 'local' && !/^server:[a-zA-Z0-9_-]{6,80}$/.test(scope)) continue;
      const mime = voiceMessages.normalizeMime(item.mime);
      const ext = voiceMessages.extensionForMime(mime);
      const file = String(item.file || '');
      if (!mime || file !== `${id}.${ext}`) continue;
      items[id] = {
        id,
        scope,
        ownerId: String(item.ownerId || '').slice(0, 64),
        mime,
        ext,
        file,
        size: Math.max(0, Number(item.size) || 0),
        duration: voiceMessages.clampSeconds(item.duration),
        at: Number(item.at) || Date.now(),
      };
    }
  }
  voiceStore = { items };
  return voiceStore;
}

function saveVoiceStore() {
  if (!voiceStore) return;
  try {
    fs.mkdirSync(voiceDir(), { recursive: true });
    fs.writeFileSync(voiceIndexPath(), JSON.stringify(voiceStore), 'utf8');
  } catch (err) {
    console.error('[voice] Nie udało się zapisać indeksu nagrań:', err.message);
  }
}

function voiceScopeAllowed(scope, memberId) {
  if (scope === 'local') return Boolean(findUserById(memberId));
  if (scope.startsWith('server:')) {
    const server = findHostedServer(scope.slice(7));
    return Boolean(server && server.members.some((member) => member.id === memberId));
  }
  return false;
}

function pruneVoiceTokens() {
  const now = Date.now();
  for (const [token, entry] of voiceTokens) {
    if (!entry || entry.expiresAt <= now) voiceTokens.delete(token);
  }
}

function issueVoiceToken(ws, scope, memberId) {
  pruneVoiceTokens();
  const token = crypto.randomBytes(24).toString('hex');
  voiceTokens.set(token, {
    scope,
    memberId,
    expiresAt: Date.now() + VOICE_TOKEN_TTL,
  });
  if (!ws._voiceTokens) ws._voiceTokens = new Set();
  ws._voiceTokens.add(token);
  return token;
}

function revokeVoiceTokens(ws, scopePrefix = '') {
  if (!ws._voiceTokens) return;
  for (const token of [...ws._voiceTokens]) {
    const entry = voiceTokens.get(token);
    if (!entry || !scopePrefix || entry.scope.startsWith(scopePrefix)) {
      voiceTokens.delete(token);
      ws._voiceTokens.delete(token);
    }
  }
}

function activeVoiceToken(value) {
  const token = String(value || '');
  if (!token) return null;
  const entry = voiceTokens.get(token);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    voiceTokens.delete(token);
    return null;
  }
  if (!voiceScopeAllowed(entry.scope, entry.memberId)) return null;
  return entry;
}

function removeVoiceItem(id) {
  if (!voiceMessages.isValidId(id)) return false;
  const store = loadVoiceStore();
  const item = store.items[id];
  if (!item) return false;
  delete store.items[id];
  try {
    fs.unlinkSync(path.join(voiceDir(), item.file));
  } catch { /* plik mógł już zniknąć */ }
  return true;
}

function removeVoiceFromMessages(messages) {
  let changed = false;
  for (const message of Array.isArray(messages) ? messages : []) {
    const parsed = voiceMessages.parse(message?.text);
    if (parsed && removeVoiceItem(parsed.id)) changed = true;
  }
  return changed;
}

function removeVoiceForServer(server) {
  if (!server || typeof server !== 'object') return false;
  let changed = false;
  for (const list of Object.values(server.messages || {})) {
    if (removeVoiceFromMessages(list)) changed = true;
  }
  for (const list of Object.values(server.dms || {})) {
    if (removeVoiceFromMessages(list)) changed = true;
  }
  return changed;
}

function pruneOrphanedVoices(maxAgeMs = 24 * 60 * 60 * 1000) {
  const store = loadVoiceStore();
  const ids = Object.keys(store.items);
  if (!ids.length) return;
  const referenced = new Set();
  const collect = (messages) => {
    for (const message of Array.isArray(messages) ? messages : []) {
      const parsed = voiceMessages.parse(message?.text);
      if (parsed) referenced.add(parsed.id);
    }
  };
  for (const server of loadServersStore().hosted) {
    for (const list of Object.values(server.messages || {})) collect(list);
    for (const list of Object.values(server.dms || {})) collect(list);
  }
  for (const list of Object.values(loadChatStore().dms || {})) collect(list);

  const cutoff = Date.now() - maxAgeMs;
  let changed = false;
  for (const id of ids) {
    const item = store.items[id];
    if (!item || referenced.has(id) || Number(item.at) > cutoff) continue;
    delete store.items[id];
    try {
      fs.unlinkSync(path.join(voiceDir(), item.file));
    } catch { /* plik mógł już zniknąć */ }
    changed = true;
  }
  if (changed) saveVoiceStore();
}


function uniqueInviteCode() {
  const hosted = loadServersStore().hosted;
  let code = makeInviteCode();
  for (let i = 0; i < 20 && hosted.some((server) => server.invite === code); i++) code = makeInviteCode();
  return code;
}

function serverShareLink(server) {
  return `chill://${lanAddress()}:${CHAT_PORT}/${server.invite}`;
}

function hostedMembership(server, userId) {
  return {
    id: server.id,
    name: server.name,
    icon: server.icon || '',
    color: server.color,
    owner: true,
    ownerId: server.ownerId,
    address: `127.0.0.1:${CHAT_PORT}`,
    invite: server.invite,
    shareLink: serverShareLink(server),
    channels: server.channels.map((channel) => ({ id: channel.id, name: channel.name, type: channel.type, createdAt: channel.createdAt })),
    ownerKey: server.ownerKey,
    memberId: userId,
    createdAt: server.createdAt,
  };
}

function joinedMembership(entry) {
  return {
    id: entry.id,
    name: entry.name || 'Serwer',
    icon: entry.icon || '',
    color: entry.color || '#3ee0a3',
    owner: false,
    address: entry.address,
    invite: entry.invite,
    shareLink: `chill://${entry.address}/${entry.invite}`,
    memberId: entry.memberId,
    joinedAt: entry.joinedAt || Date.now(),
  };
}

function serverMembersPayload(server) {
  const online = new Set();
  for (const ws of serverSessions.get(server.id) || []) {
    if (ws && ws._serverSession) online.add(ws._serverSession.memberId);
  }
  return server.members
    .map((member) => ({
      id: member.id,
      name: member.name,
      color: member.color,
      owner: Boolean(member.owner),
      online: online.has(member.id),
      lastSeen: member.lastSeen || null,
    }))
    .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, 'pl'));
}

function serverDmsPayload(server, memberId) {
  const out = {};
  for (const [key, list] of Object.entries(server.dms || {})) {
    const [a, b] = String(key).split('|');
    if (a === memberId || b === memberId) out[key] = Array.isArray(list) ? list.slice(-300) : [];
  }
  return out;
}

function serverSockets(serverId) {
  let set = serverSessions.get(serverId);
  if (!set) {
    set = new Set();
    serverSessions.set(serverId, set);
  }
  return set;
}

function broadcastServer(serverId, payload, except = null) {
  const set = serverSessions.get(serverId);
  if (!set || !set.size) return;
  const raw = JSON.stringify({ ...payload, at: Date.now() });
  for (const ws of set) {
    if (ws !== except && ws.readyState === 1) ws.send(raw);
  }
}

function broadcastServerMembers(server) {
  broadcastServer(server.id, { type: 'server:members', members: serverMembersPayload(server) });
}

function closeServerSessions(serverId, payload) {
  const set = serverSessions.get(serverId);
  if (!set) return;
  const raw = JSON.stringify({ ...payload, at: Date.now() });
  for (const ws of set) {
    if (ws.readyState === 1) ws.send(raw);
  }
  serverSessions.delete(serverId);
  setTimeout(() => {
    for (const ws of set) {
      try { ws.close(); } catch { /* ignore */ }
    }
  }, 80);
}

function userColorFor(name) {
  let hash = 0;
  for (let i = 0; i < String(name).length; i++) hash = (hash * 31 + String(name).charCodeAt(i)) | 0;
  return `hsl(${Math.abs(hash) % 360}, 68%, 62%)`;
}

function usersPayload() {
  const live = users;
  return allPublicUsers().map((u) => {
    const record = live.get(u.id);
    const online = Boolean(record) && record.status !== 'invisible';
    return {
      id: u.id,
      name: u.displayName || u.username,
      username: u.username,
      color: u.color,
      about: u.about,
      status: online ? record.status : 'offline',
      playing: online ? record.playing : null,
      online,
      lastSeen: record ? record.lastSeen : null,
    };
  });
}

function broadcastGlobal(type, payload) {
  const msg = JSON.stringify({ type, ...payload, at: Date.now() });
  for (const ws of userSockets.values()) {
    if (ws && ws.readyState === 1) ws.send(msg);
  }
}

// ---------- Porównanie wersji ----------
function compareVersions(v1, v2) {
  const p1 = String(v1).replace(/^v/, '').split('.').map(Number);
  const p2 = String(v2).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const a = p1[i] || 0;
    const b = p2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

// ---------- Automatyczne aktualizacje ----------
async function checkForUpdates() {
  try {
    const currentVersion = app.getVersion();
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { 'user-agent': `Chill/${currentVersion}`, accept: 'application/vnd.github+json' },
    });
    if (!response.ok) {
      console.error('[updater] GitHub API error:', response.status);
      return null;
    }
    const data = await response.json();
    const cleanTag = String(data.tag_name || data.name || '0.0.0').replace(/^v/, '');

    if (compareVersions(cleanTag, currentVersion) > 0) {
      let downloadUrl = data.html_url;
      if (Array.isArray(data.assets)) {
        const assets = data.assets.filter((a) => a.name && a.name.toLowerCase().endsWith('.exe'));
        const setup = assets.find((a) => /setup|install|chill/i.test(a.name)) || assets[0];
        if (setup) downloadUrl = setup.browser_download_url;
      }

      updateReady = cleanTag;
      updateInfo = { version: cleanTag, url: downloadUrl, notes: data.body || '' };

      if (win && !win.isDestroyed()) {
        win.webContents.send('chill:update-ready', updateInfo);
      }
      console.log(`[updater] Nowa wersja: ${cleanTag} (obecna: ${currentVersion})`);
    } else {
      console.log(`[updater] Aktualna wersja: ${currentVersion} (najnowsza: ${cleanTag})`);
    }
    return updateInfo;
  } catch (err) {
    console.error('[updater] Błąd sprawdzania aktualizacji:', err.message);
    return null;
  }
}

function scheduleUpdateCheck() {
  if (updateCheckInterval) clearInterval(updateCheckInterval);
  setTimeout(checkForUpdates, 2000);
  updateCheckInterval = setInterval(checkForUpdates, 4 * 60 * 60 * 1000);
}

// ---------- Serwer HTTP + WebSocket ----------
function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function detachServerSession(ws) {
  const session = ws._serverSession;
  if (!session) return;
  ws._serverSession = null;
  revokeVoiceTokens(ws, 'server:');
  const set = serverSessions.get(session.serverId);
  if (set) {
    set.delete(ws);
    if (!set.size) serverSessions.delete(session.serverId);
  }
  const server = findHostedServer(session.serverId);
  if (!server) return;
  const member = server.members.find((item) => item.id === session.memberId);
  if (member) member.lastSeen = Date.now();
  scheduleServersSave();
  broadcastServerMembers(server);
}

function handleJoinServer(ws, msg, send) {
  const invite = String(msg.invite || '').trim().toUpperCase();
  const store = loadServersStore();
  let server = msg.serverId ? findHostedServer(String(msg.serverId)) : null;
  if (!server || server.invite !== invite) {
    server = store.hosted.find((item) => item.invite === invite) || null;
  }
  if (!server) {
    send({ type: 'server:error', code: 'not-found', message: 'Nie znaleziono serwera o tym kodzie zaproszenia.' });
    return;
  }
  if (server.invite !== invite) {
    send({ type: 'server:error', code: 'invalid-invite', message: 'Nieprawidłowy kod zaproszenia.' });
    return;
  }

  detachServerSession(ws);

  const owner = Boolean(msg.ownerKey && msg.ownerKey === server.ownerKey);
  let memberId = String(msg.memberId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  if (!memberId) memberId = crypto.randomUUID();
  if (owner) memberId = server.ownerId;
  else if (memberId === server.ownerId) memberId = crypto.randomUUID();

  const name = String(msg.name || '').trim().slice(0, 32) || 'Gość';
  const color = /^#[0-9a-f]{6}$/i.test(String(msg.color || '')) ? msg.color : '#3ee0a3';

  let member = server.members.find((item) => item.id === memberId);
  if (!member) {
    member = { id: memberId, name, color, owner, joinedAt: Date.now(), lastSeen: Date.now() };
    server.members.push(member);
  } else {
    member.name = name;
    member.color = color;
    member.owner = owner;
    member.lastSeen = Date.now();
  }

  ws._serverSession = { serverId: server.id, memberId, name, color, owner };
  serverSockets(server.id).add(ws);
  const voiceKey = issueVoiceToken(ws, `server:${server.id}`, memberId);
  scheduleServersSave();

  const messages = {};
  for (const channel of server.channels) messages[channel.id] = (server.messages[channel.id] || []).slice(-300);

  send({
    type: 'server:joined',
    server: {
      id: server.id,
      name: server.name,
      icon: server.icon || '',
      color: server.color,
      invite: server.invite,
      ownerId: server.ownerId,
      createdAt: server.createdAt,
      channels: server.channels.map((channel) => ({ id: channel.id, name: channel.name, type: channel.type, createdAt: channel.createdAt })),
    },
    members: serverMembersPayload(server),
    messages,
    dms: serverDmsPayload(server, memberId),
    you: { memberId, owner },
    voiceKey,
  });
  broadcastServerMembers(server);
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readVoiceBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let done = false;
    const chunks = [];
    const fail = (error) => {
      if (done) return;
      done = true;
      reject(error);
    };
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        fail(Object.assign(new Error('too-large'), { code: 'too-large' }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks));
    });
    req.on('error', (error) => fail(error));
  });
}

function looksLikeVoiceData(buffer, mime) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  switch (mime) {
    case 'audio/webm':
      return buffer.readUInt32BE(0) === 0x1a45dfa3;
    case 'audio/ogg':
      return buffer.subarray(0, 4).toString('ascii') === 'OggS';
    case 'audio/mp4':
      return buffer.subarray(4, 8).toString('ascii') === 'ftyp';
    case 'audio/wav':
    case 'audio/x-wav':
      return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WAVE';
    case 'audio/mpeg':
      return buffer.subarray(0, 3).toString('ascii') === 'ID3'
        || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
    default:
      return false;
  }
}

function parseByteRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(value || '').trim());
  if (!match) return null;
  let start = match[1] === '' ? null : Number(match[1]);
  let end = match[2] === '' ? null : Number(match[2]);
  if (start === null && end === null) return null;
  if (start === null) {
    const suffix = Math.max(0, end);
    if (!suffix) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    end = end === null ? size - 1 : Math.min(end, size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) return null;
  return { start, end };
}

async function handleVoiceUpload(req, res, searchParams) {
  const auth = activeVoiceToken(searchParams.get('key'));
  if (!auth) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

  const mime = voiceMessages.normalizeMime(req.headers['content-type']);
  if (!mime) {
    req.resume();
    return sendJson(res, 415, { ok: false, error: 'unsupported-type' });
  }

  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > voiceMessages.MAX_BYTES) {
    req.resume();
    return sendJson(res, 413, { ok: false, error: 'too-large' });
  }

  let body;
  try {
    body = await readVoiceBody(req, voiceMessages.MAX_BYTES);
  } catch (err) {
    if (err?.code === 'too-large') return sendJson(res, 413, { ok: false, error: 'too-large' });
    return sendJson(res, 400, { ok: false, error: 'invalid-body' });
  }

  if (!looksLikeVoiceData(body, mime)) {
    return sendJson(res, 415, { ok: false, error: 'unsupported-type' });
  }

  const duration = voiceMessages.clampSeconds(searchParams.get('d'));
  if (duration < voiceMessages.MIN_SECONDS) {
    return sendJson(res, 400, { ok: false, error: 'invalid-duration' });
  }

  const id = crypto.randomBytes(16).toString('hex');
  const ext = voiceMessages.extensionForMime(mime);
  const file = `${id}.${ext}`;
  try {
    fs.mkdirSync(voiceDir(), { recursive: true });
    fs.writeFileSync(path.join(voiceDir(), file), body);
  } catch (err) {
    console.error('[voice] Nie udało się zapisać nagrania:', err.message);
    return sendJson(res, 500, { ok: false, error: 'save-failed' });
  }

  const store = loadVoiceStore();
  store.items[id] = {
    id,
    scope: auth.scope,
    ownerId: auth.memberId,
    mime,
    ext,
    file,
    size: body.length,
    duration,
    at: Date.now(),
  };
  saveVoiceStore();
  return sendJson(res, 200, { ok: true, id, duration });
}

function handleVoiceDownload(req, res, pathname, searchParams) {
  const match = /^\/voice\/([a-f0-9]{32})$/.exec(pathname);
  if (!match) return sendJson(res, 404, { ok: false, error: 'not-found' });

  const auth = activeVoiceToken(searchParams.get('key'));
  if (!auth) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

  const store = loadVoiceStore();
  const item = store.items[match[1]];
  if (!item || item.scope !== auth.scope) return sendJson(res, 404, { ok: false, error: 'not-found' });

  const filePath = path.join(voiceDir(), item.file);
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return sendJson(res, 404, { ok: false, error: 'not-found' });
  }
  if (!stat.isFile()) return sendJson(res, 404, { ok: false, error: 'not-found' });

  res.setHeader('content-type', item.mime);
  res.setHeader('cache-control', 'private, max-age=86400');
  res.setHeader('accept-ranges', 'bytes');

  if (req.method === 'HEAD') {
    res.setHeader('content-length', stat.size);
    res.writeHead(200);
    return res.end();
  }

  const range = parseByteRange(req.headers.range, stat.size);
  if (range) {
    res.writeHead(206, {
      'content-length': range.end - range.start + 1,
      'content-range': `bytes ${range.start}-${range.end}/${stat.size}`,
    });
    return fs.createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
  }

  res.writeHead(200, { 'content-length': stat.size });
  return fs.createReadStream(filePath).pipe(res);
}

function handleVoiceDelete(req, res, pathname, searchParams) {
  const match = /^\/voice\/([a-f0-9]{32})$/.exec(pathname);
  if (!match) return sendJson(res, 404, { ok: false, error: 'not-found' });

  const auth = activeVoiceToken(searchParams.get('key'));
  if (!auth) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

  const store = loadVoiceStore();
  const item = store.items[match[1]];
  if (!item || item.scope !== auth.scope) return sendJson(res, 404, { ok: false, error: 'not-found' });
  if (item.ownerId !== auth.memberId) return sendJson(res, 403, { ok: false, error: 'forbidden' });

  if (removeVoiceItem(match[1])) saveVoiceStore();
  return sendJson(res, 200, { ok: true });
}

function startChatServer(port = CHAT_PORT) {
  httpServer = http.createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url, `http://localhost:${port}`);
    } catch {
      res.writeHead(400);
      return res.end();
    }
    const { pathname, searchParams } = url;
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, HEAD, POST, DELETE, OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type, range');
    res.setHeader('access-control-expose-headers', 'content-length, content-range, accept-ranges');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    if (pathname === '/voice' && req.method === 'POST') {
      void handleVoiceUpload(req, res, searchParams);
      return;
    }

    if (/^\/voice\/[a-f0-9]{32}$/.test(pathname) && (req.method === 'GET' || req.method === 'HEAD')) {
      handleVoiceDownload(req, res, pathname, searchParams);
      return;
    }

    if (/^\/voice\/[a-f0-9]{32}$/.test(pathname) && req.method === 'DELETE') {
      handleVoiceDelete(req, res, pathname, searchParams);
      return;
    }

    res.setHeader('content-type', 'application/json');

    if (pathname === '/api/update-check') {
      res.writeHead(200);
      return res.end(JSON.stringify({
        hasUpdate: Boolean(updateInfo && compareVersions(updateInfo.version, app.getVersion()) > 0),
        currentVersion: app.getVersion(),
        latestVersion: updateInfo ? updateInfo.version : app.getVersion(),
        url: updateInfo ? updateInfo.url : '',
        notes: updateInfo ? updateInfo.notes : '',
      }));
    }

    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, app: 'chill', version: app.getVersion() }));
  });

  wss = new WebSocketServer({ server: httpServer, path: '/chat' });

  wss.on('connection', (ws, req) => {
    let currentUserId = null;
    const local = isLoopback(req.socket.remoteAddress);

    const send = (payload) => {
      if (ws.readyState === 1) ws.send(JSON.stringify(payload));
    };

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString('utf8'));

        switch (msg.type) {
          case 'join': {
            if (!local) return;
            const account = findUserById(msg.userId);
            if (!account) {
              send({ type: 'auth-error', message: 'Sesja wygasła. Zaloguj się ponownie.' });
              return;
            }
            revokeVoiceTokens(ws, 'local');
            if (currentUserId && currentUserId !== account.id) {
              const previous = users.get(currentUserId);
              if (previous) previous.status = 'offline';
              userSockets.delete(currentUserId);
            }

            currentUserId = account.id;
            const user = {
              id: account.id,
              name: account.displayName || account.username,
              color: account.color || userColorFor(account.username),
              avatar: '',
              about: account.about || '',
              status: 'online',
              playing: msg.playing || null,
              since: Date.now(),
              lastSeen: Date.now(),
            };
            users.set(currentUserId, user);
            userSockets.set(currentUserId, ws);

            const dmHistory = {};
            for (const [key, list] of Object.entries(loadChatStore().dms)) {
              const [a, b] = key.split('|');
              if (a === currentUserId || b === currentUserId) dmHistory[key] = list.slice(-300);
            }

            send({ type: 'joined', userId: currentUserId, users: usersPayload(), dmHistory, voiceKey: issueVoiceToken(ws, 'local', currentUserId) });
            broadcastGlobal('user:update', { users: usersPayload() });
            break;
          }

          case 'join-server': {
            handleJoinServer(ws, msg, send);
            break;
          }

          case 'server:leave': {
            const session = ws._serverSession;
            if (!session) return;
            const server = findHostedServer(session.serverId);
            if (server) {
              const before = server.members.length;
              server.members = server.members.filter((member) => member.id !== session.memberId);
              if (server.members.length !== before) {
                scheduleServersSave();
                broadcastServerMembers(server);
              }
            }
            detachServerSession(ws);
            break;
          }

          case 'server:message': {
            const session = ws._serverSession;
            if (!session) return;
            const server = findHostedServer(session.serverId);
            if (!server) return;
            const channel = server.channels.find((item) => item.id === String(msg.channelId || ''));
            const text = String(msg.text || '').trim().slice(0, 4000);
            if (!channel || !text) return;
            if (channel.type === 'voice') {
              send({ type: 'server:error', code: 'voice-channel', message: 'Kanały głosowe nie obsługują wiadomości tekstowych.' });
              return;
            }

            const message = {
              id: `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
              channelId: channel.id,
              authorId: session.memberId,
              authorName: session.name,
              authorColor: session.color,
              text,
              at: Date.now(),
            };
            if (!Array.isArray(server.messages[channel.id])) server.messages[channel.id] = [];
            server.messages[channel.id].push(message);
            if (server.messages[channel.id].length > 300) {
              const dropped = server.messages[channel.id].shift();
              if (removeVoiceFromMessages([dropped])) saveVoiceStore();
            }
            scheduleServersSave();
            broadcastServer(server.id, { type: 'server:message', message });
            break;
          }

          case 'server:dm': {
            const session = ws._serverSession;
            if (!session) return;
            const server = findHostedServer(session.serverId);
            if (!server) return;
            const to = String(msg.to || '');
            const text = String(msg.text || '').trim().slice(0, 4000);
            if (!to || !text || to === session.memberId) return;
            const target = server.members.find((member) => member.id === to);
            if (!target) {
              send({ type: 'server:error', code: 'dm-target', message: 'Ta osoba nie jest już członkiem serwera.' });
              return;
            }

            const message = {
              id: `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
              authorId: session.memberId,
              authorName: session.name,
              authorColor: session.color,
              to,
              text,
              at: Date.now(),
            };
            const key = dmKey(session.memberId, to);
            if (!server.dms || typeof server.dms !== 'object') server.dms = {};
            if (!Array.isArray(server.dms[key])) server.dms[key] = [];
            server.dms[key].push(message);
            if (server.dms[key].length > 500) {
              const dropped = server.dms[key].shift();
              if (removeVoiceFromMessages([dropped])) saveVoiceStore();
            }
            scheduleServersSave();

            const payload = { type: 'server:dm', serverId: server.id, message };
            send(payload);
            for (const socket of serverSockets(server.id)) {
              if (socket === ws) continue;
              if (socket._serverSession?.memberId === to && socket.readyState === 1) {
                socket.send(JSON.stringify(payload));
              }
            }
            break;
          }

          case 'server:dm:typing': {
            const session = ws._serverSession;
            if (!session) return;
            const server = findHostedServer(session.serverId);
            if (!server) return;
            const to = String(msg.to || '');
            if (!to || to === session.memberId) return;
            const target = server.members.find((member) => member.id === to);
            if (!target) return;
            const payload = {
              type: 'server:dm:typing',
              serverId: server.id,
              from: session.memberId,
              name: session.name,
              typing: Boolean(msg.typing),
            };
            for (const socket of serverSockets(server.id)) {
              if (socket._serverSession?.memberId === to && socket.readyState === 1) {
                socket.send(JSON.stringify(payload));
              }
            }
            break;
          }

          case 'server:typing': {
            const session = ws._serverSession;
            if (!session) return;
            const server = findHostedServer(session.serverId);
            if (!server) return;
            const channel = server.channels.find((item) => item.id === String(msg.channelId || ''));
            if (!channel || channel.type === 'voice') return;
            broadcastServer(server.id, {
              type: 'server:typing',
              channelId: channel.id,
              userId: session.memberId,
              name: session.name,
              typing: Boolean(msg.typing),
            }, ws);
            break;
          }

          case 'server:channel:create': {
            const session = ws._serverSession;
            if (!session) return;
            const server = findHostedServer(session.serverId);
            if (!server) return;
            if (!session.owner || server.ownerId !== session.memberId) {
              send({ type: 'server:error', code: 'forbidden', message: 'Tylko właściciel serwera może tworzyć kanały.' });
              return;
            }
            const name = String(msg.name || '').trim().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_.-]/gu, '').slice(0, 32);
            const channelType = msg.channelType === 'voice' ? 'voice' : 'text';
            if (!name) {
              send({ type: 'server:error', code: 'invalid-channel', message: 'Podaj poprawną nazwę kanału.' });
              return;
            }
            if (server.channels.some((channel) => channel.name.toLowerCase() === name.toLowerCase())) {
              send({ type: 'server:error', code: 'channel-exists', message: 'Kanał o tej nazwie już istnieje.' });
              return;
            }
            const channel = { id: makeChannelId(), name, type: channelType, createdAt: Date.now() };
            server.channels.push(channel);
            if (channelType === 'text') server.messages[channel.id] = [];
            scheduleServersSave();
            broadcastServer(server.id, {
              type: 'server:channels',
              channels: server.channels.map((item) => ({ id: item.id, name: item.name, type: item.type, createdAt: item.createdAt })),
            });
            send({ type: 'server:channel:created', channel });
            break;
          }

          case 'server:channel:delete': {
            const session = ws._serverSession;
            if (!session) return;
            const server = findHostedServer(session.serverId);
            if (!server) return;
            if (!session.owner || server.ownerId !== session.memberId) {
              send({ type: 'server:error', code: 'forbidden', message: 'Tylko właściciel serwera może usuwać kanały.' });
              return;
            }
            const channelId = String(msg.channelId || '');
            const index = server.channels.findIndex((channel) => channel.id === channelId);
            if (index < 0) {
              send({ type: 'server:error', code: 'invalid-channel', message: 'Nie znaleziono kanału.' });
              return;
            }
            const [removed] = server.channels.splice(index, 1);
            const removedVoice = removeVoiceFromMessages(server.messages[removed.id] || []);
            delete server.messages[removed.id];
            if (removedVoice) saveVoiceStore();
            scheduleServersSave();
            broadcastServer(server.id, {
              type: 'server:channel:deleted',
              channelId: removed.id,
              name: removed.name,
              actorId: session.memberId,
            });
            broadcastServer(server.id, {
              type: 'server:channels',
              channels: server.channels.map((item) => ({ id: item.id, name: item.name, type: item.type, createdAt: item.createdAt })),
            });
            break;
          }

          case 'server:profile': {
            const session = ws._serverSession;
            if (!session) return;
            const server = findHostedServer(session.serverId);
            if (!server) return;
            const member = server.members.find((item) => item.id === session.memberId);
            if (!member) return;
            if (typeof msg.name === 'string' && msg.name.trim()) {
              member.name = msg.name.trim().slice(0, 32);
              session.name = member.name;
            }
            if (typeof msg.color === 'string' && /^#[0-9a-f]{6}$/i.test(msg.color)) {
              member.color = msg.color;
              session.color = member.color;
            }
            member.lastSeen = Date.now();
            scheduleServersSave();
            broadcastServerMembers(server);
            break;
          }

          case 'dm': {
            if (!local) return;
            const { to, text } = msg;
            if (!currentUserId || !to || !text) return;
            const user = users.get(currentUserId);
            if (!user) return;
            const target = findUserById(to);
            if (!target) return;

            const message = {
              id: `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
              authorId: currentUserId,
              authorName: user.name,
              authorColor: user.color,
              to,
              text: String(text).slice(0, 4000),
              at: Date.now(),
            };

            const key = dmKey(currentUserId, to);
            const store = loadChatStore().dms;
            if (!Array.isArray(store[key])) store[key] = [];
            store[key].push(message);
            if (store[key].length > 500) {
              const dropped = store[key].shift();
              if (removeVoiceFromMessages([dropped])) saveVoiceStore();
            }
            scheduleChatSave();

            const payload = { type: 'dm', message };
            send(payload);
            const targetWs = userSockets.get(to);
            if (targetWs && targetWs.readyState === 1) targetWs.send(JSON.stringify(payload));
            break;
          }

          case 'dm:typing': {
            if (!local) return;
            const { to, typing } = msg;
            if (!currentUserId || !to) return;
            const user = users.get(currentUserId);
            if (!user) return;
            const targetWs = userSockets.get(to);
            if (targetWs && targetWs.readyState === 1) {
              targetWs.send(JSON.stringify({ type: 'dm:typing', userId: currentUserId, name: user.name, typing: Boolean(typing) }));
            }
            break;
          }

          case 'activity': {
            if (!local || !currentUserId) return;
            const user = users.get(currentUserId);
            if (!user) return;
            user.playing = msg.playing || null;
            user.lastSeen = Date.now();
            broadcastGlobal('user:update', { users: usersPayload() });
            break;
          }

          case 'status': {
            if (!local || !currentUserId) return;
            const user = users.get(currentUserId);
            if (!user) return;
            const allowed = ['online', 'away', 'dnd', 'invisible'];
            user.status = allowed.includes(msg.status) ? msg.status : 'online';
            user.lastSeen = Date.now();
            broadcastGlobal('user:update', { users: usersPayload() });
            break;
          }

          case 'profile': {
            if (!local || !currentUserId) return;
            const account = findUserById(currentUserId);
            const user = users.get(currentUserId);
            if (!account || !user) return;
            if (typeof msg.displayName === 'string' && msg.displayName.trim()) {
              account.displayName = msg.displayName.trim().slice(0, 32);
              user.name = account.displayName;
            }
            if (typeof msg.color === 'string' && /^#[0-9a-f]{6}$/i.test(msg.color)) {
              account.color = msg.color;
              user.color = msg.color;
            }
            if (typeof msg.about === 'string') {
              account.about = msg.about.slice(0, 160);
              user.about = account.about;
            }
            saveAccounts();
            broadcastGlobal('user:update', { users: usersPayload() });
            send({ type: 'profile:updated', user: publicUser(account) });
            break;
          }

          case 'users': {
            if (!local) return;
            send({ type: 'users:list', users: usersPayload() });
            break;
          }
        }
      } catch (err) {
        console.error('[chat] Błąd obsługi wiadomości:', err);
      }
    });

    ws.on('close', () => {
      detachServerSession(ws);
      revokeVoiceTokens(ws);
      if (currentUserId) {
        const user = users.get(currentUserId);
        if (user) user.status = 'offline';
        userSockets.delete(currentUserId);
        if (user) {
          users.delete(currentUserId);
          broadcastGlobal('user:update', { users: usersPayload() });
        }
      }
      currentUserId = null;
    });

    ws.on('error', () => {});
  });

  httpServer.on('error', (err) => {
    console.error('[chat] Serwer:', err.message);
  });

  httpServer.listen(port, () => {
    console.log(`[chill] Serwer czatu: http://127.0.0.1:${port}`);
  });
}

// ---------- Okno ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#0a0f0d',
    icon: ICON,
    autoHideMenuBar: true,
    show: false,
    title: 'Chill',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
      backgroundThrottling: false,
    },
  });

  win.once('ready-to-show', () => { if (!process.argv.includes('--hidden')) win.show(); });

  const wc = win.webContents;

  wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || String(url).startsWith('data:')) return;
    const en = loadAppLanguage() === 'en';
    showLoadError(en ? 'Could not load Chill' : 'Nie można wczytać Chill', `${desc || (en ? 'Loading error' : 'Błąd ładowania')} (${code})`);
  });

  wc.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      e.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    } else if (input.key === 'F12') {
      e.preventDefault();
      wc.toggleDevTools();
    } else if (input.key === 'Escape' && win.isFullScreen()) {
      win.setFullScreen(false);
    }
  });

  win.loadFile(path.join(__dirname, 'index.html')).catch(() => undefined);

  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
  });
  win.on('closed', () => { win = null; });
}

function show() {
  if (!win) {
    if (!app.isReady()) return;
    quitting = false;
    createWindow();
    win?.once('ready-to-show', () => { win?.show(); win?.focus(); });
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function showLoadError(title, detail) {
  if (!win || win.isDestroyed()) return;
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const retry = loadAppLanguage() === 'en' ? 'Try again' : 'Spróbuj ponownie';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Chill</title><style>
html,body{margin:0;height:100%;background:#0a0f0d;color:#eaf5ef;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px}
.card{max-width:420px}h1{font-size:22px;margin:0 0 8px;color:#fff}p{margin:0 0 20px;color:#93a89e}
a.btn{display:inline-block;padding:10px 22px;border-radius:12px;background:#3ee0a3;color:#04231a;font-weight:700;text-decoration:none}
</style></head><body><div class="card"><h1>${esc(title)}</h1><p>${esc(detail)}</p><a class="btn" href="javascript:location.reload()">${esc(retry)}</a></div></body></html>`;
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => undefined);
  if (win.isVisible()) show();
}

// ---------- Tray ----------
function trayTemplate() {
  const en = loadAppLanguage() === 'en';
  return [
    { label: en ? 'Open Chill' : 'Otwórz Chill', click: show },
    { type: 'separator' },
    { label: en ? 'Check for updates' : 'Sprawdź aktualizacje', click: () => { checkForUpdates().catch(() => {}); } },
    {
      label: en ? 'Start with Windows' : 'Uruchamiaj z Windows',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      visible: process.platform === 'win32',
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] }),
    },
    { type: 'separator' },
    { label: en ? 'Quit Chill' : 'Wyjdź z Chill', click: () => { quitting = true; app.quit(); } },
  ];
}

function refreshTrayMenu() {
  if (!tray) return;
  tray.setToolTip('Chill');
  tray.setContextMenu(Menu.buildFromTemplate(trayTemplate()));
}

function createTray() {
  const img = nativeImage.createFromPath(ICON).resize({ width: 18, height: 18 });
  tray = new Tray(img);
  refreshTrayMenu();
  tray.on('click', show);
  tray.on('double-click', show);
}

// ---------- Wykrywanie gry ----------
let lastGame = null;
let misses = 0;

function listProcesses() {
  return new Promise((resolve) => {
    const done = (err, out) => resolve(err ? [] : String(out).split(/\r?\n/));
    if (process.platform === 'win32') execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true, maxBuffer: 8e6 }, done);
    else execFile('ps', ['-axo', 'comm='], { maxBuffer: 8e6 }, done);
  }).then((lines) => {
    const names = new Set();
    for (const line of lines) {
      const raw = process.platform === 'win32' ? (/^"([^"]+)"/.exec(line) || [])[1] : line.trim().split('/').pop();
      if (raw) names.add(raw.toLowerCase());
    }
    return names;
  });
}

const GAMES = [
  ['minecraft.windows', 'Minecraft'], ['javaw.exe', 'Minecraft'], ['minecraftlauncher', 'Minecraft Launcher'],
  ['fortniteclient-win64-shipping', 'Fortnite'], ['robloxplayerbeta', 'Roblox'], ['valorant-win64-shipping', 'VALORANT'],
  ['league of legends', 'League of Legends'], ['cs2.exe', 'Counter-Strike 2'], ['csgo.exe', 'CS:GO'],
  ['gta5.exe', 'Grand Theft Auto V'], ['r5apex', 'Apex Legends'], ['overwatch.exe', 'Overwatch 2'],
  ['rocketleague', 'Rocket League'], ['dota2.exe', 'Dota 2'], ['rust.exe', 'Rust'],
  ['amongus', 'Among Us'], ['genshinimpact', 'Genshin Impact'], ['eldenring', 'Elden Ring'],
  ['cyberpunk2077', 'Cyberpunk 2077'], ['palworld', 'Palworld'], ['baldursgate3', "Baldur's Gate 3"],
  ['hogwartslegacy', 'Hogwarts Legacy'], ['fc25', 'EA Sports FC 25'], ['codhq', 'Call of Duty'],
  ['destiny2', 'Destiny 2'], ['wow.exe', 'World of Warcraft'], ['osu!', 'osu!'],
];

const HELPER = /launch|install|update|crash|helper|service|setup|bootstrap|widget|provider|uninst|webview|handler|tray|agent|server|report/;
function matchGame(proc, key) {
  const base = proc.replace(/\.exe$/, '');
  if (key.endsWith('.exe')) return base === key.slice(0, -4);
  return base.startsWith(key) && !HELPER.test(base.slice(key.length));
}

function withWindow(procs) {
  if (process.platform !== 'win32' || !procs.length) return Promise.resolve(null);
  const list = procs.map((p) => `'${p.replace(/\.exe$/, '').replace(/'/g, "''")}'`).join(',');
  const cmd = `Get-Process -Name ${list} -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { $_.ProcessName }; exit 0`;
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true, timeout: 15_000 }, (err, out) => {
      if (err) return resolve(null);
      resolve(new Set(String(out).split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter(Boolean)));
    });
  });
}

let polling = false;
async function pollGames() {
  if (polling) return;
  polling = true;
  try {
    const procs = [...(await listProcesses())];
    const hits = [];
    for (const [key, name] of GAMES) for (const p of procs) if (matchGame(p, key)) hits.push([p, name]);
    let found = null;
    if (hits.length) {
      const shown = await withWindow([...new Set(hits.map(([p]) => p))]);
      const hit = shown ? hits.find(([p]) => shown.has(p.replace(/\.exe$/, ''))) : hits[0];
      found = hit ? hit[1] : null;
    }
    if (found === lastGame) misses = 0;
    else if (found === null && ++misses < 2) { /* zachowaj poprzedni */ }
    else {
      misses = 0;
      lastGame = found;
      if (win) win.webContents.send('chill:activity', found);
    }
  } finally {
    polling = false;
  }
}

// ---------- Autoryzacja (IPC) ----------
function authError(message) {
  return { ok: false, error: message };
}

ipcMain.handle('chill:auth-session', () => {
  return { ok: true, user: activeSession() };
});

ipcMain.handle('chill:auth-register', (e, payload = {}) => {
  const email = String(payload.email || '').trim().toLowerCase();
  const username = String(payload.username || '').trim();
  const displayName = String(payload.displayName || '').trim() || username;
  const password = String(payload.password || '');
  const color = /^#[0-9a-f]{6}$/i.test(String(payload.color || '')) ? payload.color : '#3ee0a3';

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return authError('Podaj poprawny adres e-mail lub zostaw pole puste.');
  if (email.length > 254) return authError('Adres e-mail jest zbyt długi.');
  if (!/^[a-zA-Z0-9_.]{3,20}$/.test(username)) return authError('Nazwa użytkownika: 3–20 znaków (litery, cyfry, _ i .).');
  if (displayName.length < 2 || displayName.length > 32) return authError('Nazwa wyświetlana musi mieć 2–32 znaki.');
  if (password.length < 8) return authError('Hasło musi mieć co najmniej 8 znaków.');
  if (password.length > 128) return authError('Hasło jest zbyt długie.');

  const store = loadAccounts();
  if (email && store.users.some((u) => u.email && u.email.toLowerCase() === email)) return authError('Konto z tym adresem e-mail już istnieje.');
  if (store.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) return authError('Ta nazwa użytkownika jest już zajęta.');

  const { salt, hash } = hashPassword(password);
  const user = {
    id: crypto.randomUUID(),
    email: email || '',
    username,
    displayName: displayName.slice(0, 32),
    color,
    about: '',
    salt,
    hash,
    createdAt: Date.now(),
  };
  store.users.push(user);
  saveAccounts();
  clearDiscordSession();
  const sessionUser = issueSession(user, true);
  return { ok: true, user: sessionUser };
});

ipcMain.handle('chill:auth-login', (e, payload = {}) => {
  const identifier = String(payload.identifier || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const remember = Boolean(payload.remember);

  if (!identifier || !password) return authError('Podaj login i hasło.');

  const lock = loginLockRemaining(identifier);
  if (lock > 0) {
    const seconds = Math.ceil(lock / 1000);
    return authError(`Zbyt wiele prób. Spróbuj ponownie za ${seconds} s.`);
  }

  const user = findUserByIdentifier(identifier);
  if (!user || !verifyPassword(password, user.salt, user.hash)) {
    noteFailedLogin(identifier);
    return authError('Nieprawidłowy login lub hasło.');
  }

  clearLoginAttempts(identifier);
  if (!remember) {
    loadAccounts().session = null;
    saveAccounts();
  }
  clearDiscordSession();
  const sessionUser = issueSession(user, remember);
  return { ok: true, user: sessionUser };
});

ipcMain.handle('chill:auth-logout', () => {
  loadAccounts().session = null;
  saveAccounts();
  volatileSession = null;
  clearDiscordSession();
  return { ok: true };
});

ipcMain.handle('chill:auth-update-profile', (e, payload = {}) => {
  const current = activeSession();
  if (!current) return authError('Sesja wygasła. Zaloguj się ponownie.');
  const account = findUserById(current.id);
  if (!account) return authError('Konto nie istnieje.');

  const displayName = String(payload.displayName || '').trim();
  const about = String(payload.about || '').trim();
  const color = String(payload.color || '');

  if (displayName.length < 2 || displayName.length > 32) return authError('Nazwa musi mieć 2–32 znaki.');
  if (about.length > 160) return authError('Opis może mieć maksymalnie 160 znaków.');
  if (!/^#[0-9a-f]{6}$/i.test(color)) return authError('Wybierz poprawny kolor.');

  account.displayName = displayName;
  account.about = about;
  account.color = color;
  saveAccounts();

  const live = users.get(account.id);
  if (live) {
    live.name = displayName;
    live.color = color;
    live.about = about;
  }

  const serverStore = loadServersStore();
  let touched = false;
  for (const server of serverStore.hosted) {
    const member = server.members.find((item) => item.id === account.id);
    if (!member) continue;
    member.name = displayName;
    member.color = color;
    member.lastSeen = Date.now();
    touched = true;
    broadcastServerMembers(server);
  }
  if (touched) scheduleServersSave();
  return { ok: true, user: publicUser(account) };
});

ipcMain.handle('chill:auth-change-password', (e, payload = {}) => {
  const current = activeSession();
  if (!current) return authError('Sesja wygasła. Zaloguj się ponownie.');
  const account = findUserById(current.id);
  if (!account) return authError('Konto nie istnieje.');

  const currentPassword = String(payload.currentPassword || '');
  const newPassword = String(payload.newPassword || '');

  if (!verifyPassword(currentPassword, account.salt, account.hash)) return authError('Obecne hasło jest nieprawidłowe.');
  if (newPassword.length < 8) return authError('Nowe hasło musi mieć co najmniej 8 znaków.');
  if (newPassword.length > 128) return authError('Nowe hasło jest zbyt długie.');

  const { salt, hash } = hashPassword(newPassword);
  account.salt = salt;
  account.hash = hash;
  saveAccounts();
  return { ok: true };
});

// ---------- Serwery (IPC) ----------
ipcMain.handle('chill:servers-list', () => {
  const current = activeSession();
  if (!current) return { ok: false, error: 'Sesja wygasła. Zaloguj się ponownie.', servers: [] };
  const store = loadServersStore();
  const hosted = store.hosted
    .filter((server) => server.ownerId === current.id)
    .map((server) => hostedMembership(server, current.id));
  const hostedIds = new Set(hosted.map((server) => server.id));
  const joined = store.joined
    .filter((entry) => entry.userId === current.id && !hostedIds.has(entry.id))
    .map(joinedMembership);
  return { ok: true, servers: [...hosted, ...joined] };
});

ipcMain.handle('chill:servers-create', (e, payload = {}) => {
  const current = activeSession();
  if (!current) return { ok: false, error: 'Sesja wygasła. Zaloguj się ponownie.' };
  const name = String(payload.name || '').trim();
  const color = /^#[0-9a-f]{6}$/i.test(String(payload.color || '')) ? payload.color : '#3ee0a3';
  const icon = String(payload.icon || '').trim().slice(0, 4);
  if (name.length < 2 || name.length > 40) return { ok: false, error: 'Nazwa serwera musi mieć 2–40 znaków.' };

  const store = loadServersStore();
  const channelName = String(payload.channelName || 'ogólny').trim().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_.-]/gu, '').slice(0, 32) || 'ogólny';
  const server = {
    id: makeServerId(),
    ownerId: current.id,
    name,
    icon,
    color,
    invite: uniqueInviteCode(),
    ownerKey: crypto.randomBytes(24).toString('hex'),
    createdAt: Date.now(),
    channels: [{ id: makeChannelId(), name: channelName, type: 'text', createdAt: Date.now() }],
    members: [],
    messages: {},
  };
  server.messages[server.channels[0].id] = [];
  store.hosted.push(server);
  saveServersStore();
  return { ok: true, server: hostedMembership(server, current.id) };
});

ipcMain.handle('chill:servers-save-joined', (e, payload = {}) => {
  const current = activeSession();
  if (!current) return { ok: false, error: 'Sesja wygasła. Zaloguj się ponownie.' };
  const incoming = payload.server && typeof payload.server === 'object' ? payload.server : {};
  const id = String(incoming.id || '').trim();
  const address = String(payload.address || '').trim();
  const invite = String(payload.invite || '').trim().toUpperCase();
  if (!/^[a-zA-Z0-9_-]{6,80}$/.test(id)) return { ok: false, error: 'Serwer przesłał nieprawidłowy identyfikator.' };
  if (!/^[a-zA-Z0-9.-]+:\d{2,5}$/.test(address)) return { ok: false, error: 'Nieprawidłowy adres serwera.' };
  if (!/^[A-Z0-9]{4,16}$/.test(invite)) return { ok: false, error: 'Nieprawidłowy kod zaproszenia.' };

  const store = loadServersStore();
  const owned = store.hosted.find((server) => server.id === id && server.ownerId === current.id);
  if (owned) return { ok: true, server: hostedMembership(owned, current.id) };

  const name = String(incoming.name || 'Serwer').trim().slice(0, 40) || 'Serwer';
  const color = /^#[0-9a-f]{6}$/i.test(String(incoming.color || '')) ? incoming.color : '#3ee0a3';
  const icon = String(incoming.icon || '').trim().slice(0, 4);
  let entry = store.joined.find((item) => item.userId === current.id && item.id === id);
  if (!entry) {
    entry = { userId: current.id, id, joinedAt: Date.now(), memberId: '' };
    store.joined.push(entry);
  }
  entry.address = address;
  entry.invite = invite;
  entry.name = name;
  entry.color = color;
  entry.icon = icon;
  const memberId = String(payload.memberId || entry.memberId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  entry.memberId = memberId || crypto.randomUUID();
  entry.joinedAt = entry.joinedAt || Date.now();
  saveServersStore();
  return { ok: true, server: joinedMembership(entry) };
});

ipcMain.handle('chill:servers-leave', (e, payload = {}) => {
  const current = activeSession();
  if (!current) return { ok: false, error: 'Sesja wygasła. Zaloguj się ponownie.' };
  const id = String(payload.id || '').trim();
  if (!id) return { ok: false, error: 'Nie wskazano serwera.' };
  const store = loadServersStore();
  const hostedIndex = store.hosted.findIndex((server) => server.id === id && server.ownerId === current.id);
  if (hostedIndex >= 0) {
    const hosted = store.hosted[hostedIndex];
    if (removeVoiceForServer(hosted)) saveVoiceStore();
    store.hosted.splice(hostedIndex, 1);
    store.joined = store.joined.filter((entry) => !(entry.userId === current.id && entry.id === id));
    saveServersStore();
    closeServerSessions(id, { type: 'server:deleted', serverId: id });
    return { ok: true, deleted: true };
  }
  const before = store.joined.length;
  store.joined = store.joined.filter((entry) => !(entry.userId === current.id && entry.id === id));
  if (store.joined.length === before) return { ok: false, error: 'Nie należysz do tego serwera.' };
  saveServersStore();
  return { ok: true, deleted: false };
});

ipcMain.handle('chill:servers-invite', (e, payload = {}) => {
  const current = activeSession();
  if (!current) return { ok: false, error: 'Sesja wygasła. Zaloguj się ponownie.' };
  const id = String(payload.id || '').trim();
  const store = loadServersStore();
  const hosted = store.hosted.find((server) => server.id === id && server.ownerId === current.id);
  if (hosted) return { ok: true, shareLink: serverShareLink(hosted), invite: hosted.invite };
  const entry = store.joined.find((item) => item.userId === current.id && item.id === id);
  if (!entry) return { ok: false, error: 'Nie znaleziono serwera.' };
  return { ok: true, shareLink: `chill://${entry.address}/${entry.invite}`, invite: entry.invite };
});


// ---------- Import z Discord (OAuth 2.0 + PKCE) ----------
const DISCORD_API = 'https://discord.com/api';
const DISCORD_REDIRECT_URI = 'http://localhost:47831/callback';
const DISCORD_CALLBACK_PORT = 47831;
const DISCORD_OAUTH_TIMEOUT = 5 * 60 * 1000;
const DISCORD_USER_AGENT = 'Chill/4.3.4 (https://github.com/HyperZmylka/chill, 4.3.4)';
const DISCORD_IMPORT_COLORS = ['#3ee0a3', '#7cc8ff', '#ffa46b', '#ff7aa2', '#b8a1ff', '#ffd166'];

let discordConfig = null;
let discordSession = null;
let discordOAuth = null;

function loadDiscordConfig() {
  if (discordConfig) return discordConfig;
  try {
    const raw = JSON.parse(fs.readFileSync(discordPath(), 'utf8'));
    discordConfig = { clientId: /^\d{15,21}$/.test(String(raw.clientId || '')) ? String(raw.clientId) : '' };
  } catch {
    discordConfig = { clientId: '' };
  }
  return discordConfig;
}

function writeDiscordConfig(clientId) {
  fs.writeFileSync(discordPath(), JSON.stringify({ clientId }, null, 2), 'utf8');
  discordConfig = { clientId };
}

function discordError(message, code) {
  const error = new Error(message);
  if (code) error.code = code;
  return error;
}

function discordFailure(error) {
  return {
    ok: false,
    code: error?.code || 'discord-error',
    error: error?.message || 'Nie udało się połączyć z Discord.',
  };
}

// Tryb deweloperski: pozwala sprawdzić cały interfejs bez prawdziwego konta Discord.
// W spakowanej aplikacji jest zawsze wyłączony.
function discordMockEnabled() {
  return !app.isPackaged && process.env.CHILL_DISCORD_MOCK === '1';
}

const DISCORD_MOCK_GUILD_ID = '111111111111111111';
const DISCORD_MOCK_TEMPLATE_CODE = 'hgM48av5Q69A';

function discordMockGuilds() {
  return [
    { id: DISCORD_MOCK_GUILD_ID, name: 'Mockownia', owner: true, icon: null, approximate_member_count: 7 },
    { id: '222222222222222222', name: 'Cudzy serwer', owner: false, icon: null, approximate_member_count: 42 },
  ];
}

function discordMockTemplate(code) {
  if (code !== DISCORD_MOCK_TEMPLATE_CODE) return null;
  return {
    code,
    name: 'Mockownia',
    source_guild_id: DISCORD_MOCK_GUILD_ID,
    serialized_source_guild: {
      name: 'Mockownia',
      channels: [
        { id: 1, type: 4, name: 'Tekstowe', position: 1, parent_id: null },
        { id: 2, type: 0, name: 'ogólny', position: 1, parent_id: 1 },
        { id: 3, type: 0, name: 'ogloszenia', position: 2, parent_id: 1 },
        { id: 4, type: 2, name: 'Lounge', position: 1, parent_id: null },
        { id: 5, type: 14, name: 'katalog', position: 2, parent_id: null },
      ],
    },
  };
}

function base64Url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

function sendOAuthPage(res, status, ok, message) {
  if (!res || res.writableEnded || res.destroyed) return;
  const en = loadAppLanguage() === 'en';
  const title = ok
    ? (en ? 'Discord connected' : 'Discord połączony')
    : (en ? 'Could not connect Discord' : 'Nie udało się połączyć z Discord');
  const hint = ok
    ? (en ? 'You can close this tab and return to Chill.' : 'Możesz zamknąć tę kartę i wrócić do Chill.')
    : (en ? 'Return to Chill and try again.' : 'Wróć do Chill i spróbuj ponownie.');
  const html = `<!doctype html>
<html lang="${en ? 'en' : 'pl'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escapeHtml(title)} · Chill</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #07130e; color: #eaf4ee; font: 15px/1.55 "Segoe UI", system-ui, sans-serif; }
  main { width: min(460px, 100%); padding: 32px; border: 1px solid rgba(255,255,255,.1); border-radius: 22px; background: #0f1714; box-shadow: 0 24px 70px rgba(0,0,0,.45); text-align: center; }
  .logo { width: 54px; height: 54px; margin: 0 auto 18px; display: grid; place-items: center; border-radius: 17px; background: linear-gradient(140deg, #3ee0a3, #7cc8ff); color: #05271c; font: 800 30px/1 "Segoe UI", sans-serif; }
  h1 { margin: 0 0 10px; font-size: 23px; letter-spacing: -.02em; }
  p { margin: 0; color: #b7c9bf; overflow-wrap: anywhere; }
  .hint { margin-top: 18px; color: #8ea59a; font-size: 12.5px; }
</style>
</head>
<body><main><div class="logo">C</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p class="hint">${escapeHtml(hint)}</p></main></body>
</html>`;
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    'Cache-Control': 'no-store',
    'Connection': 'close',
  });
  res.end(html);
}

async function discordRequest(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw discordError('Brak połączenia z Discord. Sprawdź internet i spróbuj ponownie.', 'network');
  }

  let data = null;
  try { data = await response.json(); } catch { /* ignore */ }
  if (response.ok) return data;

  let message = `Nie udało się pobrać danych z Discord (${response.status}).`;
  let code = 'discord-error';
  if (response.status === 401) {
    message = 'Sesja Discord wygasła. Połącz się ponownie.';
    code = 'unauthorized';
  } else if (response.status === 403) {
    message = 'Discord nie udostępnił wymaganych danych. Połącz ponownie i zaakceptuj dostęp do serwerów.';
    code = 'forbidden';
  } else if (response.status === 429) {
    message = 'Discord chwilowo ogranicza liczbę żądań. Spróbuj za chwilę.';
    code = 'rate-limit';
  }
  const error = discordError(message, code);
  error.status = response.status;
  error.discordMessage = data?.message || data?.error_description || '';
  throw error;
}

function storeDiscordToken(data) {
  const accessToken = String(data?.access_token || '');
  if (!accessToken) throw discordError('Discord nie zwrócił tokenu dostępu. Spróbuj ponownie.', 'oauth-failed');
  discordSession = {
    accessToken,
    refreshToken: String(data?.refresh_token || ''),
    expiresAt: Date.now() + Math.max(0, Number(data?.expires_in) || 0) * 1000,
    user: discordSession?.user || null,
    guilds: Array.isArray(discordSession?.guilds) ? discordSession.guilds : [],
  };
}

async function exchangeDiscordCode({ clientId, code, verifier }) {
  if (discordMockEnabled()) {
    return { access_token: 'mock-access-token', refresh_token: 'mock-refresh-token', expires_in: 3600, token_type: 'Bearer', scope: 'identify guilds' };
  }
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: DISCORD_REDIRECT_URI,
    code_verifier: verifier,
  });
  try {
    return await discordRequest(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json', 'User-Agent': DISCORD_USER_AGENT },
      body: body.toString(),
    });
  } catch (error) {
    if (error.status === 400 || error.status === 401) {
      throw discordError('Discord odrzucił logowanie. Spróbuj ponownie.', 'oauth-failed');
    }
    throw error;
  }
}

function runDiscordOAuth(clientId) {
  if (discordOAuth) {
    return Promise.reject(discordError('Połączanie z Discord już trwa.', 'oauth-busy'));
  }
  if (discordMockEnabled()) {
    return Promise.resolve({ access_token: 'mock-access-token', refresh_token: 'mock-refresh-token', expires_in: 3600, token_type: 'Bearer', scope: 'identify guilds' });
  }

  const state = base64Url(crypto.randomBytes(24));
  const verifier = base64Url(crypto.randomBytes(48));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  const authUrl = buildAuthorizationUrl({
    clientId,
    redirectUri: DISCORD_REDIRECT_URI,
    state,
    codeChallenge: challenge,
  });

  return new Promise((resolve, reject) => {
    let server = null;
    let timer = null;
    let callbackRes = null;
    let claimed = false;
    let done = false;

    const cleanup = () => {
      clearTimeout(timer);
      if (server) {
        try { server.close(); } catch { /* ignore */ }
      }
      if (discordOAuth?.state === state) discordOAuth = null;
    };

    const fail = (error) => {
      if (done) return;
      done = true;
      cleanup();
      reject(error);
    };

    server = http.createServer((req, res) => {
      const remote = String(req.socket.remoteAddress || '');
      if (!/^(?:::ffff:)?127\.0\.0\.1$|^::1$/.test(remote)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }

      let url = null;
      try { url = new URL(req.url, 'http://localhost'); } catch { /* ignore */ }
      if (!url || url.pathname !== '/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      if (claimed) {
        sendOAuthPage(res, 409, false, 'To połączenie zostało już zakończone. Wróć do Chill.');
        return;
      }
      if (url.searchParams.get('state') !== state) {
        sendOAuthPage(res, 400, false, 'Nieprawidłowy stan połączenia. Spróbuj ponownie z Chill.');
        return;
      }

      const oauthError = url.searchParams.get('error');
      if (oauthError) {
        const message = oauthError === 'access_denied'
          ? 'Anulowano logowanie w Discord.'
          : 'Discord odrzucił połączenie. Spróbuj ponownie.';
        sendOAuthPage(res, 400, false, message);
        fail(discordError(message, oauthError === 'access_denied' ? 'oauth-denied' : 'oauth-failed'));
        return;
      }

      const code = url.searchParams.get('code');
      if (!code) {
        sendOAuthPage(res, 400, false, 'Discord nie zwrócił kodu autoryzacji. Spróbuj ponownie.');
        fail(discordError('Discord nie zwrócił kodu autoryzacji. Spróbuj ponownie.', 'oauth-failed'));
        return;
      }

      claimed = true;
      done = true;
      clearTimeout(timer);
      callbackRes = res;
      resolve({
        code,
        verifier,
        clientId,
        succeed: (message) => {
          if (!callbackRes) return;
          sendOAuthPage(callbackRes, 200, true, message);
          callbackRes = null;
        },
        fail: (message) => {
          if (!callbackRes) return;
          sendOAuthPage(callbackRes, 400, false, message);
          callbackRes = null;
        },
        cleanup,
      });
    });

    server.on('error', (error) => {
      const message = error.code === 'EADDRINUSE'
        ? 'Port 47831 jest zajęty. Zamknij program, który go używa, i spróbuj ponownie.'
        : 'Nie udało się uruchomić lokalnego połączenia z Discord. Spróbuj ponownie.';
      fail(discordError(message, error.code === 'EADDRINUSE' ? 'port-busy' : 'oauth-server'));
    });

    discordOAuth = {
      state,
      cancel: () => {
        if (!done) fail(discordError('Połączanie z Discord zostało anulowane.', 'cancelled'));
      },
    };

    // Nasłuch na obu stosach (IPv4 i IPv6), bo przeglądarki różnie rozwiązują „localhost”.
    // Adres zdalny jest ograniczony do pętli zwrotnej w obsłudze żądania.
    server.listen(DISCORD_CALLBACK_PORT, () => {
      shell.openExternal(authUrl).catch(() => {
        fail(discordError('Nie udało się otworzyć przeglądarki. Spróbuj ponownie.', 'browser'));
      });
    });

    timer = setTimeout(() => {
      fail(discordError('Nie otrzymano odpowiedzi od Discord. Spróbuj ponownie.', 'timeout'));
    }, DISCORD_OAUTH_TIMEOUT);
  }).then(async (flow) => {
    try {
      const token = await exchangeDiscordCode(flow);
      flow.succeed('Zalogowano do Discord. Możesz teraz wrócić do Chill.');
      return token;
    } catch (error) {
      flow.fail(error.message);
      throw error;
    } finally {
      flow.cleanup();
    }
  });
}

async function ensureDiscordAccessToken() {
  if (!discordSession?.accessToken) {
    throw discordError('Połącz się z Discord, aby zaimportować serwer.', 'needs-connect');
  }
  if (discordMockEnabled()) return discordSession.accessToken;
  if (discordSession.expiresAt - Date.now() > 60000) return discordSession.accessToken;
  if (!discordSession.refreshToken) {
    discordSession = null;
    throw discordError('Sesja Discord wygasła. Połącz się ponownie.', 'needs-connect');
  }

  const config = loadDiscordConfig();
  if (!config.clientId) {
    discordSession = null;
    throw discordError('Najpierw podaj Client ID aplikacji Discord.', 'needs-setup');
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    grant_type: 'refresh_token',
    refresh_token: discordSession.refreshToken,
  });
  try {
    const data = await discordRequest(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json', 'User-Agent': DISCORD_USER_AGENT },
      body: body.toString(),
    });
    storeDiscordToken(data);
    return discordSession.accessToken;
  } catch (error) {
    if (error.status === 400 || error.status === 401) {
      discordSession = null;
      throw discordError('Sesja Discord wygasła. Połącz się ponownie.', 'needs-connect');
    }
    throw error;
  }
}

async function fetchDiscordUser(token) {
  if (discordMockEnabled()) {
    return { id: '333333333333333333', username: 'mockowner', displayName: 'Mock Owner', avatarUrl: '' };
  }
  const data = await discordRequest(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': DISCORD_USER_AGENT },
  });
  const id = String(data?.id || '');
  if (!/^\d{15,21}$/.test(id)) throw discordError('Nie udało się zweryfikować konta Discord. Spróbuj ponownie.', 'discord-error');
  const avatarHash = String(data?.avatar || '');
  return {
    id,
    username: String(data?.username || ''),
    displayName: String(data?.global_name || data?.username || 'Discord').trim().slice(0, 100) || 'Discord',
    avatarUrl: /^(?:a_)?[a-f0-9]{32}$/i.test(avatarHash)
      ? `https://cdn.discordapp.com/avatars/${id}/${avatarHash}.png?size=64`
      : '',
  };
}

async function fetchOwnedGuilds(token) {
  if (discordMockEnabled()) return filterOwnedGuilds(discordMockGuilds());
  const data = await discordRequest(`${DISCORD_API}/users/@me/guilds?with_counts=true`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': DISCORD_USER_AGENT },
  });
  if (!Array.isArray(data)) throw discordError('Discord zwrócił nieprawidłową listę serwerów. Spróbuj ponownie.', 'discord-error');
  return filterOwnedGuilds(data);
}

async function connectDiscordInternal() {
  const config = loadDiscordConfig();
  if (!config.clientId) {
    throw discordError('Najpierw podaj Client ID aplikacji Discord.', 'needs-setup');
  }

  let token;
  try {
    token = await ensureDiscordAccessToken();
  } catch (error) {
    if (error.code !== 'needs-connect' && error.code !== 'unauthorized') throw error;
    const data = await runDiscordOAuth(config.clientId);
    storeDiscordToken(data);
    token = discordSession.accessToken;
  }

  const [user, guilds] = await Promise.all([
    fetchDiscordUser(token),
    fetchOwnedGuilds(token),
  ]);
  if (discordSession) {
    discordSession.user = user;
    discordSession.guilds = guilds;
  }
  return { user, guilds };
}

async function fetchDiscordTemplate(code) {
  if (discordMockEnabled()) {
    const template = discordMockTemplate(code);
    if (!template) throw discordError('Nie udało się pobrać szablonu Discord. Sprawdź link i spróbuj ponownie.', 'template-error');
    return template;
  }
  try {
    return await discordRequest(`${DISCORD_API}/guilds/templates/${encodeURIComponent(code)}`, {
      headers: { Accept: 'application/json', 'User-Agent': DISCORD_USER_AGENT },
    });
  } catch (error) {
    if (error.status === 400 || error.status === 404) {
      throw discordError('Nie udało się pobrać szablonu Discord. Sprawdź link i spróbuj ponownie.', 'template-error');
    }
    throw error;
  }
}

async function discordOwnedGuild(guildId) {
  if (!/^\d{15,21}$/.test(String(guildId || ''))) {
    throw discordError('Nie znaleziono wybranego serwera Discord na Twoim koncie.', 'guild-missing');
  }
  const token = await ensureDiscordAccessToken();
  const guilds = await fetchOwnedGuilds(token);
  if (discordSession) discordSession.guilds = guilds;
  const guild = guilds.find((item) => item.id === guildId);
  if (!guild) {
    throw discordError('Nie jesteś właścicielem tego serwera Discord. Import dostępny jest tylko dla serwerów, które sam stworzyłeś.', 'not-owner');
  }
  return guild;
}

async function templateForGuild(guildId, templateInput) {
  const code = parseTemplateCode(templateInput);
  if (!code) {
    throw discordError('Wklej poprawny link szablonu, np. https://discord.new/AbCd1234.', 'invalid-template');
  }
  const template = await fetchDiscordTemplate(code);
  if (!template || typeof template !== 'object' || !template.serialized_source_guild) {
    throw discordError('Nie udało się pobrać szablonu Discord. Sprawdź link i spróbuj ponownie.', 'template-error');
  }
  if (String(template.source_guild_id || '') !== guildId) {
    throw discordError('Ten szablon należy do innego serwera Discord. Wybierz szablon swojego serwera.', 'template-mismatch');
  }
  return { code, template, mapped: mapTemplateChannels(template) };
}

function uniqueImportedChannelName(channels, base) {
  let name = base;
  let suffix = 2;
  while (channels.some((channel) => channel.name.toLowerCase() === name.toLowerCase())) {
    const tail = `-${suffix++}`;
    name = `${base.slice(0, 32 - tail.length)}${tail}`;
  }
  return name;
}

function importedServerColor(guildId) {
  let hash = 0;
  for (const character of String(guildId)) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return DISCORD_IMPORT_COLORS[hash % DISCORD_IMPORT_COLORS.length];
}

function cancelDiscordOAuth() {
  if (!discordOAuth) return false;
  discordOAuth.cancel();
  return true;
}

function clearDiscordSession() {
  cancelDiscordOAuth();
  discordSession = null;
}

ipcMain.handle('chill:discord-config-get', () => {
  const current = activeSession();
  if (!current) return { ok: false, code: 'auth', error: 'Sesja wygasła. Zaloguj się ponownie.' };
  const config = loadDiscordConfig();
  return {
    ok: true,
    clientId: config.clientId,
    redirectUri: DISCORD_REDIRECT_URI,
    connected: Boolean(discordSession?.accessToken),
    user: discordSession?.user || null,
    guilds: Array.isArray(discordSession?.guilds) ? discordSession.guilds : [],
  };
});

ipcMain.handle('chill:discord-config-set', (e, payload = {}) => {
  const current = activeSession();
  if (!current) return { ok: false, code: 'auth', error: 'Sesja wygasła. Zaloguj się ponownie.' };
  const clientId = String(payload.clientId || '').trim();
  if (!/^\d{15,21}$/.test(clientId)) {
    return { ok: false, code: 'invalid-client-id', error: 'Client ID musi składać się z 15–21 cyfr. Skopiuj Application ID z Discord Developer Portal.' };
  }
  const previous = loadDiscordConfig().clientId;
  try {
    writeDiscordConfig(clientId);
  } catch (error) {
    console.error('[discord] Nie udało się zapisać konfiguracji:', error.message);
    return { ok: false, code: 'config-save', error: 'Nie udało się zapisać konfiguracji Discord na dysku.' };
  }
  if (previous !== clientId) {
    cancelDiscordOAuth();
    discordSession = null;
  }
  return { ok: true, clientId, redirectUri: DISCORD_REDIRECT_URI };
});

ipcMain.handle('chill:discord-connect', async () => {
  const current = activeSession();
  if (!current) return { ok: false, code: 'auth', error: 'Sesja wygasła. Zaloguj się ponownie.' };
  try {
    const result = await connectDiscordInternal();
    return { ok: true, ...result };
  } catch (error) {
    return discordFailure(error);
  }
});

ipcMain.handle('chill:discord-disconnect', () => {
  cancelDiscordOAuth();
  discordSession = null;
  return { ok: true };
});

ipcMain.handle('chill:discord-cancel', () => {
  cancelDiscordOAuth();
  return { ok: true };
});

ipcMain.handle('chill:discord-preview', async (e, payload = {}) => {
  const current = activeSession();
  if (!current) return { ok: false, code: 'auth', error: 'Sesja wygasła. Zaloguj się ponownie.' };
  const guildId = String(payload.guildId || '');
  try {
    await discordOwnedGuild(guildId);
    const info = await templateForGuild(guildId, payload.template);
    return {
      ok: true,
      template: {
        code: info.code,
        name: normalizeServerName(info.template.name),
        channels: info.mapped.channels,
        total: info.mapped.total,
        truncated: info.mapped.truncated,
        skipped: info.mapped.skipped,
      },
    };
  } catch (error) {
    return discordFailure(error);
  }
});

ipcMain.handle('chill:discord-import', async (e, payload = {}) => {
  const current = activeSession();
  if (!current) return { ok: false, code: 'auth', error: 'Sesja wygasła. Zaloguj się ponownie.' };
  const guildId = String(payload.guildId || '');

  try {
    // Właściciela sprawdzamy ponownie bezpośrednio przed zapisem.
    const guild = await discordOwnedGuild(guildId);

    const store = loadServersStore();
    const duplicate = store.hosted.find((server) => server.ownerId === current.id && String(server.discordGuildId || '') === guildId);
    if (duplicate) {
      return {
        ok: false,
        code: 'already-imported',
        serverName: duplicate.name,
        error: `Serwer „${duplicate.name}” został już zaimportowany.`,
      };
    }

    const info = await templateForGuild(guildId, payload.template);
    const now = Date.now();
    const channels = info.mapped.channels.map((channel) => ({
      id: makeChannelId(),
      name: channel.name,
      type: channel.type,
      createdAt: now,
    }));

    // Chill potrzebuje kanału tekstowego jako punktu startowego.
    if (!channels.some((channel) => channel.type === 'text')) {
      if (channels.length >= MAX_IMPORTED_CHANNELS) channels.splice(MAX_IMPORTED_CHANNELS - 1);
      channels.unshift({
        id: makeChannelId(),
        name: uniqueImportedChannelName(channels, 'ogólny'),
        type: 'text',
        createdAt: now,
      });
    }

    const server = {
      id: makeServerId(),
      ownerId: current.id,
      name: normalizeServerName(guild.name),
      icon: '',
      color: importedServerColor(guildId),
      invite: uniqueInviteCode(),
      ownerKey: crypto.randomBytes(24).toString('hex'),
      createdAt: now,
      channels,
      members: [],
      messages: Object.fromEntries(channels.map((channel) => [channel.id, []])),
      discordGuildId: guildId,
      discordTemplateCode: info.code,
      discordImportedAt: now,
    };

    store.hosted.push(server);
    try {
      persistServersStore();
    } catch (error) {
      store.hosted.pop();
      console.error('[discord] Nie udało się zapisać serwera:', error.message);
      throw discordError('Nie udało się zapisać zaimportowanego serwera na dysku.', 'save-failed');
    }

    return {
      ok: true,
      server: hostedMembership(server, current.id),
      imported: {
        channels: channels.length,
        total: info.mapped.total,
        truncated: info.mapped.truncated,
        skipped: info.mapped.skipped,
      },
    };
  } catch (error) {
    return discordFailure(error);
  }
});

// ---------- IPC aplikacji ----------
ipcMain.on('chill:app-packaged', (e) => { e.returnValue = app.isPackaged; });
ipcMain.handle('chill:app-version', () => app.getVersion());

ipcMain.on('chill:app-language', (e, lang) => {
  const next = lang === 'en' ? 'en' : 'pl';
  if (next === loadAppLanguage()) return;
  saveAppLanguage(next);
  refreshTrayMenu();
});

ipcMain.handle('chill:autostart-get', () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('chill:autostart-set', (e, enabled) => {
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), args: ['--hidden'] });
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.on('chill:badge', (e, count) => {
  const value = Math.max(0, Number(count) || 0);
  if (process.platform === 'darwin') app.dock?.setBadge(value > 0 ? String(value) : '');
  else if (win) {
    if (value > 0 && !win.isFocused()) win.flashFrame(true);
    win.setOverlayIcon(null, '');
  }
});

ipcMain.on('chill:notify', (e, n) => {
  if (!Notification.isSupported() || (win && win.isFocused())) return;
  const note = new Notification({
    title: String(n?.title ?? 'Chill').slice(0, 80),
    body: String(n?.body ?? '').slice(0, 220),
    icon: ICON,
    silent: true,
  });
  note.on('click', () => show());
  note.show();
});

ipcMain.on('chill:shell-open-external', (e, url) => {
  if (typeof url === 'string' && /^https:\/\//i.test(url)) void shell.openExternal(url);
});

ipcMain.on('chill:activity:ask', () => {
  if (win) win.webContents.send('chill:activity', lastGame);
});

ipcMain.handle('chill:screen-sources', async () => {
  const own = win && typeof win.getMediaSourceId === 'function' ? String(win.getMediaSourceId()).split(':').slice(0, 2).join(':') : '';
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcon: true });
  return sources
    .filter((s) => !(own && s.id.startsWith('window:') && String(s.id).split(':').slice(0, 2).join(':') === own))
    .map((s) => ({
      id: s.id,
      name: String(s.name || '').slice(0, 120),
      kind: s.id.startsWith('screen:') ? 'screen' : 'window',
      thumb: s.thumbnail && !s.thumbnail.isEmpty() ? `data:image/jpeg;base64,${s.thumbnail.toJPEG(70).toString('base64')}` : null,
      icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.resize({ width: 32, height: 32 }).toDataURL() : null,
    }));
});

ipcMain.handle('chill:screen-pick', (e, id) => typeof id === 'string');

// ---------- Aktualizacje (IPC) ----------
ipcMain.handle('chill:update-check', async () => checkForUpdates());

ipcMain.handle('chill:update-install', async () => {
  if (!app.isPackaged) return false;
  const url = updateInfo?.url || '';
  if (!url) return false;

  if (!url.toLowerCase().includes('.exe')) {
    void shell.openExternal(url);
    return false;
  }

  try {
    if (!isTrustedUpdateUrl(url)) throw new Error('Niezaufany adres aktualizacji');
    const safeVersion = String(updateInfo.version || 'new').replace(/[^0-9A-Za-z.-]/g, '');
    const file = path.join(app.getPath('temp'), `Chill-${safeVersion}-Setup.exe`);
    if (!fs.existsSync(file)) await downloadUpdate(url, file);
    const openError = await shell.openPath(file);
    if (openError) throw new Error(openError);
    setTimeout(() => {
      quitting = true;
      app.quit();
    }, 900);
    return true;
  } catch (err) {
    console.error('[updater] Błąd pobierania:', err.message);
    return false;
  }
});

ipcMain.on('chill:update-ask', () => {
  if (updateInfo && win && !win.isDestroyed()) {
    win.webContents.send('chill:update-ready', updateInfo);
  }
});

// ---------- Pobieranie aktualizacji ----------
function isTrustedUpdateUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && (
      u.hostname === 'github.com' ||
      u.hostname.endsWith('.github.com') ||
      u.hostname.endsWith('.githubusercontent.com') ||
      u.hostname === 'objects.githubusercontent.com'
    );
  } catch {
    return false;
  }
}

function downloadUpdate(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Za dużo przekierowań'));
    https.get(url, { headers: { 'user-agent': `Chill/${app.getVersion()}` } }, (res) => {
      const status = res.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        if (!isTrustedUpdateUrl(next)) return reject(new Error('Niebezpieczny adres przekierowania'));
        return resolve(downloadUpdate(next, dest, redirects + 1));
      }
      if (status !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${status}`));
      }
      const part = `${dest}.part`;
      const out = fs.createWriteStream(part);
      const total = Number(res.headers['content-length'] || 0);
      let received = 0;
      let lastSent = -1;
      res.on('data', (chunk) => {
        received += chunk.length;
        if (total > 0) {
          const pct = Math.min(100, Math.round((received / total) * 100));
          if (pct !== lastSent && win && !win.isDestroyed()) {
            lastSent = pct;
            win.webContents.send('chill:update-progress', pct);
          }
        }
      });
      res.on('error', reject);
      out.on('error', reject);
      out.on('finish', () => {
        out.close(() => {
          try {
            fs.renameSync(part, dest);
            resolve(dest);
          } catch (err) {
            reject(err);
          }
        });
      });
      res.pipe(out);
    }).on('error', reject);
  });
}

// ---------- Start ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => show());
  app.on('open-url', (e) => { e.preventDefault(); show(); });

  app.whenReady().then(() => {
    app.userAgentFallback = `${app.userAgentFallback} ChillDesktop/${app.getVersion()}`;
    app.setAsDefaultProtocolClient('chill');
    if (process.platform === 'win32') app.setAppUserModelId('app.chill.desktop');

    const ses = session.defaultSession;
    ses.setPermissionRequestHandler((wc, permission, cb) => cb(['media', 'notifications', 'display-capture', 'clipboard-read'].includes(permission)));
    ses.setPermissionCheckHandler(() => true);

    loadAccounts();
    loadChatStore();
    loadServersStore();
    startChatServer(CHAT_PORT);
    createWindow();
    createTray();
    Menu.setApplicationMenu(null);

    const sweepVoices = () => {
      try { pruneOrphanedVoices(); } catch (err) { console.error('[voice] Sprzątanie nie powiodło się:', err.message); }
    };
    setTimeout(sweepVoices, 30_000).unref?.();
    setInterval(sweepVoices, 6 * 60 * 60 * 1000).unref?.();

    scheduleUpdateCheck();

    setInterval(() => { pollGames().catch(() => {}); }, 20_000);
    setTimeout(() => { pollGames().catch(() => {}); }, 3000);
  });
}

app.on('before-quit', () => {
  quitting = true;
  clearTimeout(chatSaveTimer);
  clearTimeout(serversSaveTimer);
  try {
    if (chatStore) fs.writeFileSync(chatDataPath(), JSON.stringify(chatStore), 'utf8');
    if (serversStore) fs.writeFileSync(serversPath(), JSON.stringify(serversStore), 'utf8');
    if (voiceStore) {
      fs.mkdirSync(voiceDir(), { recursive: true });
      fs.writeFileSync(voiceIndexPath(), JSON.stringify(voiceStore), 'utf8');
    }
  } catch { /* ignore */ }
});
app.on('will-quit', () => { setTimeout(() => app.exit(0), 8_000).unref?.(); });
app.on('window-all-closed', () => { /* aplikacja zostaje w tray */ });
app.on('activate', () => { if (win) show(); else createWindow(); });
