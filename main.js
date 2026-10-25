// Yapper Chat - nowoczesny komunikator desktopowy
// Automatyczne aktualizacje z GitHub Releases
const { app, BrowserWindow, Menu, Tray, nativeImage, shell, session, desktopCapturer, ipcMain, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const { execFile } = require('node:child_process');
const { WebSocketServer } = require('ws');

const ICON = path.join(__dirname, 'build', 'icon.png');

// ================= KONFIGURACJA GITHUB =================
// ZMIEŹ TO NA SWÓJ REPOSITORIUM, np. 'TwojaNazwa/yapper-chat'
const GITHUB_REPO = 'HyperZmylka/yapper-chat';
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

// ---------- Użytkownicy i pokoje ----------
const users = new Map();
const rooms = new Map();
const userSockets = new Map();

const ME = {
  id: 'me',
  name: 'Ty',
  color: '#ff6b4a',
  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=You',
  status: 'online',
  playing: null,
};

// ---------- Pomocnicze ----------
function esc(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function ownUrl(url) {
  try {
    const u = new URL(url);
    return ALLOWED_HOSTS.has(u.hostname) || u.protocol === 'yapper-chat:';
  } catch { return false; }
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

function broadcastGlobal(type, payload) {
  const msg = JSON.stringify({ type, ...payload, at: Date.now() });
  for (const ws of userSockets.values()) {
    if (ws && ws.readyState === 1) ws.send(msg);
  }
}

function userColorFor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 60%)`;
}

function ensureDefaultRooms() {
  if (rooms.size === 0) {
    rooms.set('general', { id: 'general', name: 'Ogólny', type: 'public', members: new Set(['me']), messages: [] });
    rooms.set('random', { id: 'random', name: 'Random', type: 'public', members: new Set(['me']), messages: [] });
    rooms.set('gaming', { id: 'gaming', name: 'Gaming', type: 'public', members: new Set(['me']), messages: [] });
  }
}

// ---------- Porównanie wersji (semver proste) ----------
function compareVersions(v1, v2) {
  const p1 = v1.replace(/^v/, '').split('.').map(Number);
  const p2 = v2.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const a = p1[i] || 0;
    const b = p2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

// ---------- Automatyczne aktualizacje z GitHub ----------
async function checkForUpdates() {
  if (GITHUB_REPO === 'TWOJA-NAZWA-UZYTKOWNIKA/yapper-chat') {
    console.log('[updater] Ustaw własne repozytorium w GITHUB_REPO w main.js');
    return null;
  }
  try {
    const currentVersion = app.getVersion();
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
    if (!response.ok) {
      console.error('[updater] GitHub API error:', response.status);
      return null;
    }
    const data = await response.json();
    const latestTag = data.tag_name || data.name || '0.0.0';
    const cleanTag = latestTag.replace(/^v/, '');

    if (compareVersions(cleanTag, currentVersion) > 0) {
      // Szukaj pliku .exe do pobrania
      let downloadUrl = data.html_url;
      if (data.assets && Array.isArray(data.assets)) {
        const exeAsset = data.assets.find((a) => a.name && a.name.endsWith('.exe'));
        if (exeAsset) downloadUrl = exeAsset.browser_download_url;
      }

      updateReady = cleanTag;
      updateInfo = { version: cleanTag, url: downloadUrl, notes: data.body || '' };

      if (win && !win.isDestroyed()) {
        win.webContents.send('yapper:update-ready', {
          version: cleanTag,
          url: downloadUrl,
          notes: data.body || '',
        });
      }
      console.log(`[updater] Nowa wersja: ${cleanTag}, obecna: ${currentVersion}`);
    } else {
      console.log(`[updater] Brak aktualizacji (obecna: ${currentVersion}, najnowsza: ${cleanTag})`);
    }
    return updateInfo;
  } catch (err) {
    console.error('[updater] Błąd sprawdzania aktualizacji:', err.message);
    return null;
  }
}

function scheduleUpdateCheck() {
  if (updateCheckInterval) clearInterval(updateCheckInterval);
  // Sprawdź po 5 sekundach od startu
  setTimeout(checkForUpdates, 5000);
  // Co 4 godziny
  updateCheckInterval = setInterval(checkForUpdates, 4 * 60 * 60 * 1000);
}

// ---------- Serwer HTTP + WebSocket ----------
function startChatServer(port = 47830) {
  ensureDefaultRooms();
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
        version: updateInfo ? updateInfo.version : app.getVersion(),
        url: updateInfo ? updateInfo.url : '',
        notes: updateInfo ? updateInfo.notes : '',
      }));
    }

    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, app: 'yapper-chat', version: app.getVersion() }));
  });

  wss = new WebSocketServer({ server: httpServer, path: '/chat' });

  wss.on('connection', (ws) => {
    let currentUserId = null;

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString('utf8'));
        switch (msg.type) {
          case 'join': {
            currentUserId = msg.userId || 'me';
            const user = {
              id: currentUserId,
              name: msg.name || 'Użytkownik',
              color: msg.color || userColorFor(msg.name || 'Użytkownik'),
              avatar: msg.avatar || ME.avatar,
              status: 'online',
              playing: msg.playing || null,
              since: Date.now(),
              lastSeen: Date.now(),
            };
            users.set(currentUserId, user);
            userSockets.set(currentUserId, ws);

            for (const [roomId, room] of rooms) {
              room.members.add(currentUserId);
            }

            ws.send(JSON.stringify({ type: 'joined', userId: currentUserId, me: ME, users: [...users.values()], rooms: [...rooms.entries()].map(([id, r]) => ({ id: r.id, name: r.name, type: r.type, memberCount: r.members.size, messages: r.messages.slice(-200), lastMessage: r.messages[r.messages.length - 1] || null })) }));
            broadcastGlobal('user:joined', { user });
            break;
          }

          case 'message': {
            const { roomId, text, replyTo } = msg;
            if (!currentUserId || !roomId || !text) return;
            const user = users.get(currentUserId);
            if (!user) return;
            const room = rooms.get(roomId);
            if (!room || !room.members.has(currentUserId)) return;

            const message = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              roomId,
              authorId: currentUserId,
              authorName: user.name,
              authorColor: user.color,
              authorAvatar: user.avatar,
              text: String(text).slice(0, 2000),
              replyTo: replyTo || null,
              at: Date.now(),
            };
            room.messages.push(message);
            if (room.messages.length > 500) room.messages.shift();
            broadcastToRoom(roomId, 'message', { message });
            break;
          }

          case 'dm': {
            const { to, text } = msg;
            if (!currentUserId || !to || !text) return;
            const user = users.get(currentUserId);
            const targetUser = users.get(to);
            if (!user || !targetUser) return;

            const message = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              authorId: currentUserId,
              authorName: user.name,
              authorColor: user.color,
              authorAvatar: user.avatar,
              to,
              text: String(text).slice(0, 2000),
              at: Date.now(),
            };

            const dmMsg = JSON.stringify({ type: 'dm', message });
            if (ws && ws.readyState === 1) ws.send(dmMsg);
            const targetWs = userSockets.get(to);
            if (targetWs && targetWs.readyState === 1) targetWs.send(dmMsg);
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
            broadcastToRoom(roomId, 'user:typing', { userId: currentUserId, name: user.name, typing: Boolean(typing) });
            break;
          }

          case 'activity': {
            const { playing } = msg;
            if (!currentUserId) return;
            const user = users.get(currentUserId);
            if (user) {
              user.playing = playing || null;
              user.lastSeen = Date.now();
              broadcastGlobal('user:activity', { userId: currentUserId, playing: user.playing });
            }
            break;
          }

          case 'status': {
            const { status } = msg;
            if (!currentUserId) return;
            const user = users.get(currentUserId);
            if (user) {
              user.status = status;
              user.lastSeen = Date.now();
              broadcastGlobal('user:status', { userId: currentUserId, status });
            }
            break;
          }

          case 'users': {
            ws.send(JSON.stringify({ type: 'users:list', users: [...users.values()] }));
            break;
          }
        }
      } catch (err) {
        // ignore malformed messages
      }
    });

    ws.on('close', () => {
      if (currentUserId) {
        const user = users.get(currentUserId);
        if (user) {
          user.status = 'offline';
          user.lastSeen = Date.now();
          broadcastGlobal('user:left', { userId: currentUserId, user });
        }
        userSockets.delete(currentUserId);
        for (const room of rooms.values()) room.members.delete(currentUserId);
      }
      currentUserId = null;
    });

    ws.on('error', () => {});
  });

  httpServer.listen(port, () => {
    console.log(`[yapper-chat] Serwer czatu na http://127.0.0.1:${port}`);
  });
}

// ---------- Okno ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 700,
    minHeight: 500,
    backgroundColor: '#0f1115',
    icon: ICON,
    autoHideMenuBar: true,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
      backgroundThrottling: false,
    },
  });

  win.once('ready-to-show', () => { win.show(); });
  win.on('show', () => { });

  const wc = win.webContents;

  wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || String(url).startsWith('data:')) return;
    showLoadError('Nie można połączyć z czatem', `${desc || 'Błąd ładowania'} (${code})`);
  });

  wc.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      e.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    } else if (input.key === 'Escape' && win.isFullScreen()) {
      win.setFullScreen(false);
    }
  });

  const indexPath = path.join(__dirname, 'index.html');
  win.loadFile(indexPath).catch(() => undefined);

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
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Yapper Chat</title><style>
html,body{margin:0;height:100%;background:#0f1115;color:#e8eaed;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px}
.card{max-width:400px}h1{font-size:22px;margin:0 0 8px;color:#fff}p{margin:0 0 20px;color:#94a3b8}
a.btn{display:inline-block;padding:10px 22px;border-radius:10px;background:#ff6b4a;color:#fff;font-weight:600;text-decoration:none}
a.btn:hover{background:#ff8264}
</style></head><body><div class="card"><h1>${esc(title)}</h1><p>${esc(detail)}</p><a class="btn" href="javascript:location.reload()">Spróbuj ponownie</a></div></body></html>`;
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => undefined);
  if (win.isVisible()) show();
}

// ---------- Tray ----------
function createTray() {
  const img = nativeImage.createFromPath(ICON).resize({ width: 18, height: 18 });
  tray = new Tray(img);
  tray.setToolTip('Yapper Chat');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Otwórz Yapper Chat', click: show },
    { type: 'separator' },
    { label: 'Sprawdź aktualizacje', click: () => { checkForUpdates().catch(() => {}); } },
    { label: 'Uruchamiaj z Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, visible: process.platform === 'win32', click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] }) },
    { type: 'separator' },
    { label: 'Wyjdź z Yapper Chat', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', show);
  tray.on('double-click', show);
}

// ---------- Wykrywanie granej gry ----------
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
    else if (found === null && ++misses < 2) { /* keep */ }
    else { misses = 0; lastGame = found; if (win) win.webContents.send('yapper:activity', found); }
  } finally { polling = false; }
}

// ---------- Most IPC ----------
ipcMain.on('yapper:badge', (e, count) => {
  if (process.platform === 'darwin') app.dock?.setBadge(count > 0 ? String(count) : '');
  else if (win) {
    if (count > 0 && !win.isFocused()) win.flashFrame(true);
    win.setOverlayIcon(null, '');
  }
});

ipcMain.on('yapper:notify', (e, n) => {
  if (!Notification.isSupported() || (win && win.isFocused())) return;
  const note = new Notification({ title: String(n?.title ?? 'Yapper Chat').slice(0, 80), body: String(n?.body ?? '').slice(0, 200), icon: ICON, silent: true });
  note.on('click', () => { show(); });
  note.show();
});

ipcMain.handle('yapper:screen-sources', async (e) => {
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

ipcMain.handle('yapper:screen-pick', (e, id) => {
  if (typeof id !== 'string') return false;
  return true;
});

ipcMain.on('yapper:activity:ask', (e) => {
  if (win) win.webContents.send('yapper:activity', lastGame);
});

ipcMain.on('yapper:shell-open-external', (e, url) => {
  if (typeof url === 'string' && url.startsWith('http')) {
    void shell.openExternal(url);
  }
});

// ---------- Aktualizacje (IPC) ----------
ipcMain.handle('yapper:update-check', async () => {
  return await checkForUpdates();
});

ipcMain.handle('yapper:update-install', async (e) => {
  const url = updateInfo?.url || '';
  if (!url) return false;

  // Brak pliku .exe (np. tylko źródła) – otwórz stronę wydania
  if (!url.toLowerCase().includes('.exe')) {
    void shell.openExternal(url);
    return false;
  }

  try {
    if (!isTrustedUpdateUrl(url)) throw new Error('Niezaufany adres aktualizacji');
    const safeVersion = String(updateInfo.version || 'new').replace(/[^0-9A-Za-z.-]/g, '');
    const file = path.join(app.getPath('temp'), `YapperChat-${safeVersion}-Setup.exe`);
    if (!fs.existsSync(file)) {
      await downloadUpdate(url, file);
    }
    const openError = await shell.openPath(file);
    if (openError) throw new Error(openError);
    return true;
  } catch (err) {
    console.error('[updater] Błąd pobierania:', err.message);
    // Awaryjnie: pobierz przez przeglądarkę
    void shell.openExternal(url);
    return false;
  }
});

ipcMain.on('yapper:update-ask', () => {
  if (updateInfo && win && !win.isDestroyed()) {
    win.webContents.send('yapper:update-ready', updateInfo);
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
    https.get(url, { headers: { 'user-agent': `YapperChat/${app.getVersion()}` } }, (res) => {
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
            win.webContents.send('yapper:update-progress', pct);
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
app.setAsDefaultProtocolClient('yapper-chat');
app.on('second-instance', (_e, argv) => { show(); });
app.on('open-url', (e, url) => { e.preventDefault(); show(); });

app.whenReady().then(() => {
  app.userAgentFallback = `${app.userAgentFallback} YapperChatDesktop/${app.getVersion()}`;
  if (process.platform === 'win32') app.setAppUserModelId('chat.yapper.desktop');

  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, cb) => cb(['media', 'notifications', 'display-capture', 'clipboard-read'].includes(permission)));
  ses.setPermissionCheckHandler(() => true);

  ensureDefaultRooms();
  startChatServer(47830);
  createWindow();
  createTray();
  Menu.setApplicationMenu(null);

  scheduleUpdateCheck();

  setInterval(() => { pollGames().catch(() => {}); }, 20_000);
  setTimeout(() => { pollGames().catch(() => {}); }, 3000);

  const hidden = process.argv.includes('--hidden');
  if (!hidden) show();
});

app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { setTimeout(() => app.exit(0), 8_000).unref?.(); });
app.on('window-all-closed', () => { /* stays in tray */ });
app.on('activate', () => { if (win) show(); else createWindow(); });
