// Chill - komunikator desktopowy
// Konta lokalne, czat WebSocket, automatyczne aktualizacje z GitHub Releases
const { app, BrowserWindow, Menu, Tray, nativeImage, shell, session, desktopCapturer, ipcMain, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { WebSocketServer } = require('ws');

app.setName('Chill');

const ICON = path.join(__dirname, 'build', 'icon.png');

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

// ---------- Użytkownicy online i pokoje ----------
const users = new Map();
const userSockets = new Map();
const rooms = new Map();

const ROOM_DEFS = [
  { id: 'lounge', name: 'Lounge', emoji: '☕', topic: 'Przywitaj się i pogadaj o wszystkim' },
  { id: 'gaming', name: 'Gaming', emoji: '🎮', topic: 'Gry, co-op i turnieje' },
  { id: 'muzyka', name: 'Muzyka', emoji: '🎧', topic: 'Czego teraz słuchasz?' },
  { id: 'memy', name: 'Memy', emoji: '😂', topic: 'Najlepsze znaleziska z internetu' },
];

function ensureRooms() {
  loadChatStore();
  for (const def of ROOM_DEFS) {
    if (!rooms.has(def.id)) {
      rooms.set(def.id, {
        id: def.id,
        name: def.name,
        emoji: def.emoji,
        topic: def.topic,
        members: new Set(),
        messages: Array.isArray(chatStore.rooms[def.id]) ? chatStore.rooms[def.id] : [],
      });
    }
  }
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

function broadcastToRoom(roomId, type, payload) {
  const room = rooms.get(roomId);
  if (!room) return;
  const msg = JSON.stringify({ type, ...payload, at: Date.now() });
  for (const memberId of room.members) {
    const ws = userSockets.get(memberId);
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
  setTimeout(checkForUpdates, 5000);
  updateCheckInterval = setInterval(checkForUpdates, 4 * 60 * 60 * 1000);
}

// ---------- Serwer HTTP + WebSocket ----------
function startChatServer(port = 47830) {
  ensureRooms();
  httpServer = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, `http://localhost:${port}`);
    res.setHeader('access-control-allow-origin', '*');
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

  wss.on('connection', (ws) => {
    let currentUserId = null;

    const send = (payload) => {
      if (ws.readyState === 1) ws.send(JSON.stringify(payload));
    };

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString('utf8'));

        switch (msg.type) {
          case 'join': {
            const account = findUserById(msg.userId);
            if (!account) {
              send({ type: 'auth-error', message: 'Sesja wygasła. Zaloguj się ponownie.' });
              return;
            }
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

            for (const room of rooms.values()) room.members.add(currentUserId);

            const dmHistory = {};
            for (const [key, list] of Object.entries(loadChatStore().dms)) {
              const [a, b] = key.split('|');
              if (a === currentUserId || b === currentUserId) dmHistory[key] = list.slice(-300);
            }

            send({
              type: 'joined',
              userId: currentUserId,
              users: usersPayload(),
              rooms: [...rooms.values()].map((r) => ({
                id: r.id,
                name: r.name,
                emoji: r.emoji,
                topic: r.topic,
                messages: r.messages.slice(-300),
                lastMessage: r.messages[r.messages.length - 1] || null,
              })),
              dmHistory,
            });
            broadcastGlobal('user:update', { users: usersPayload() });
            break;
          }

          case 'message': {
            const { roomId, text } = msg;
            if (!currentUserId || !roomId || !text) return;
            const user = users.get(currentUserId);
            const room = rooms.get(roomId);
            if (!user || !room || !room.members.has(currentUserId)) return;

            const message = {
              id: `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
              roomId,
              authorId: currentUserId,
              authorName: user.name,
              authorColor: user.color,
              text: String(text).slice(0, 4000),
              at: Date.now(),
            };
            room.messages.push(message);
            if (room.messages.length > 500) room.messages.shift();
            loadChatStore().rooms[roomId] = room.messages;
            scheduleChatSave();
            broadcastToRoom(roomId, 'message', { message });
            break;
          }

          case 'dm': {
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
            if (store[key].length > 500) store[key].shift();
            scheduleChatSave();

            const payload = { type: 'dm', message };
            send(payload);
            const targetWs = userSockets.get(to);
            if (targetWs && targetWs.readyState === 1) targetWs.send(JSON.stringify(payload));
            break;
          }

          case 'dm:typing': {
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

          case 'typing': {
            const { roomId, typing } = msg;
            if (!currentUserId || !roomId) return;
            const user = users.get(currentUserId);
            if (!user) return;
            broadcastToRoom(roomId, 'user:typing', { roomId, userId: currentUserId, name: user.name, typing: Boolean(typing) });
            break;
          }

          case 'activity': {
            if (!currentUserId) return;
            const user = users.get(currentUserId);
            if (!user) return;
            user.playing = msg.playing || null;
            user.lastSeen = Date.now();
            broadcastGlobal('user:update', { users: usersPayload() });
            break;
          }

          case 'status': {
            if (!currentUserId) return;
            const user = users.get(currentUserId);
            if (!user) return;
            const allowed = ['online', 'away', 'dnd', 'invisible'];
            user.status = allowed.includes(msg.status) ? msg.status : 'online';
            user.lastSeen = Date.now();
            broadcastGlobal('user:update', { users: usersPayload() });
            break;
          }

          case 'profile': {
            if (!currentUserId) return;
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
            send({ type: 'users:list', users: usersPayload() });
            break;
          }
        }
      } catch {
        // niepoprawna ramka - ignorujemy
      }
    });

    ws.on('close', () => {
      if (currentUserId) {
        const user = users.get(currentUserId);
        if (user) user.status = 'offline';
        userSockets.delete(currentUserId);
        for (const room of rooms.values()) room.members.delete(currentUserId);
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
    showLoadError('Nie można wczytać Chill', `${desc || 'Błąd ładowania'} (${code})`);
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
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Chill</title><style>
html,body{margin:0;height:100%;background:#0a0f0d;color:#eaf5ef;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px}
.card{max-width:420px}h1{font-size:22px;margin:0 0 8px;color:#fff}p{margin:0 0 20px;color:#93a89e}
a.btn{display:inline-block;padding:10px 22px;border-radius:12px;background:#3ee0a3;color:#04231a;font-weight:700;text-decoration:none}
</style></head><body><div class="card"><h1>${esc(title)}</h1><p>${esc(detail)}</p><a class="btn" href="javascript:location.reload()">Spróbuj ponownie</a></div></body></html>`;
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => undefined);
  if (win.isVisible()) show();
}

// ---------- Tray ----------
function createTray() {
  const img = nativeImage.createFromPath(ICON).resize({ width: 18, height: 18 });
  tray = new Tray(img);
  tray.setToolTip('Chill');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Otwórz Chill', click: show },
    { type: 'separator' },
    { label: 'Sprawdź aktualizacje', click: () => { checkForUpdates().catch(() => {}); } },
    {
      label: 'Uruchamiaj z Windows',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      visible: process.platform === 'win32',
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] }),
    },
    { type: 'separator' },
    { label: 'Wyjdź z Chill', click: () => { quitting = true; app.quit(); } },
  ]));
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
  const sessionUser = issueSession(user, remember);
  return { ok: true, user: sessionUser };
});

ipcMain.handle('chill:auth-logout', () => {
  loadAccounts().session = null;
  saveAccounts();
  volatileSession = null;
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

// ---------- IPC aplikacji ----------
ipcMain.handle('chill:app-version', () => app.getVersion());

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
    return true;
  } catch (err) {
    console.error('[updater] Błąd pobierania:', err.message);
    void shell.openExternal(url);
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
    ensureRooms();
    startChatServer(47830);
    createWindow();
    createTray();
    Menu.setApplicationMenu(null);

    scheduleUpdateCheck();

    setInterval(() => { pollGames().catch(() => {}); }, 20_000);
    setTimeout(() => { pollGames().catch(() => {}); }, 3000);
  });
}

app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { setTimeout(() => app.exit(0), 8_000).unref?.(); });
app.on('window-all-closed', () => { /* aplikacja zostaje w tray */ });
app.on('activate', () => { if (win) show(); else createWindow(); });
