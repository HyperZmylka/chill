'use strict';

// Tauri desktop smoke: registration, friend accept, avatars, attachment drop +
// caption, Spotify on a voice channel, with zero JS exceptions.
//
// Run: node test/tauri-smoke.js
// Requires the Tauri UI assets in rust/chill-desktop/assets (npm run build:tauri-ui
// or node scripts/prepare-tauri-ui.js) and a built rust/target/debug/chill-desktop.exe.
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const WebSocket = require('ws');

const ROOT = path.resolve(__dirname, '..');
const BASE = path.join(os.tmpdir(), 'opencode', 'chill-test');
const DATA = path.join(BASE, 'tauri-smoke-data');
const PROFILE = path.join(BASE, 'tauri-webview-profile');
const PORT = Number(process.env.E2E_PORT || 47951);
const DEBUG_PORT = Number(process.env.E2E_DEBUG_PORT || 47952);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const WS_URL = `ws://127.0.0.1:${PORT}/chat`;
const BIN = process.env.E2E_BIN || path.join(ROOT, 'rust', 'target', 'debug', 'chill-desktop.exe');
const WEB_ROOT = path.join(ROOT, 'rust', 'chill-desktop', 'assets');
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const AVATAR = `data:image/png;base64,${PNG}`;
const SPOTIFY_URL = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';

let passed = 0;
let failed = 0;
const failures = [];
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Jar {
  constructor() { this.cookies = new Map(); }
  header() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }
  store(response) {
    const list = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    for (const raw of list) {
      const pair = String(raw).split(';')[0];
      const index = pair.indexOf('=');
      if (index < 0) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      const maxAge = /;\s*Max-Age=0(?:;|$)/i.test(raw);
      if (!name || maxAge || value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
}

async function bridge(jar, channel, payload = {}) {
  const response = await fetch(`${ORIGIN}/api/bridge`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-chill-csrf': jar.cookies.get('chill_csrf') || '',
      Cookie: jar.header(),
    },
    body: JSON.stringify({ channel, payload }),
  });
  jar.store(response);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${ORIGIN}/healthz`);
      if (response.ok) return;
    } catch { /* not ready */ }
    if (appProcess.exitCode !== null) throw new Error(`aplikacja zakończyła się: ${appLog}`);
    await sleep(200);
  }
  throw new Error(`serwer Tauri nie wystartował: ${appLog}`);
}

class CDP {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
  }
  open() {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.ws = socket;
      const timer = setTimeout(() => reject(new Error('CDP timeout')), 10_000);
      socket.on('open', () => { clearTimeout(timer); resolve(); });
      socket.on('message', (raw) => {
        let message;
        try { message = JSON.parse(raw.toString('utf8')); } catch { return; }
        if (message.id) {
          const entry = this.pending.get(message.id);
          if (!entry) return;
          this.pending.delete(message.id);
          if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`));
          else entry.resolve(message.result || {});
          return;
        }
        const listeners = this.handlers.get(message.method);
        if (listeners) for (const listener of [...listeners]) listener(message.params || {});
      });
      socket.on('error', (error) => { clearTimeout(timer); reject(error); });
    });
  }
  send(method, params = {}, timeout = 20_000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: timeout`));
      }, timeout);
      this.pending.set(id, {
        method,
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, listener) {
    if (!this.handlers.has(method)) this.handlers.set(method, new Set());
    this.handlers.get(method).add(listener);
  }
  close() { try { this.ws.close(); } catch { /* ignore */ } }
}

async function findPageTarget() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      if (response.ok) {
        const list = await response.json();
        const pages = list.filter((item) => item.type === 'page');
        const match = pages.find((item) => String(item.url).includes(`127.0.0.1:${PORT}`)) || pages[0];
        if (match?.webSocketDebuggerUrl) return match;
      }
    } catch { /* not ready */ }
    if (appProcess.exitCode !== null) throw new Error(`aplikacja zakończyła się: ${appLog}`);
    await sleep(250);
  }
  throw new Error(`WebView2 debugger nie wystartował: ${appLog}`);
}

function createClient(label, userId) {
  const socket = new WebSocket(WS_URL);
  const messages = [];
  const waiters = new Set();
  const client = {
    label,
    ws: socket,
    messages,
    userId,
    send(payload) { socket.send(JSON.stringify(payload)); },
    waitFor(predicate, timeout = 8000, description = 'event') {
      for (const message of messages) if (predicate(message)) return Promise.resolve(message);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, reject };
        const timer = setTimeout(() => {
          waiters.delete(waiter);
          reject(new Error(`${label}: timeout waiting for ${description}`));
        }, timeout);
        waiter.timer = timer;
        waiters.add(waiter);
      });
    },
    close() { try { socket.close(); } catch { /* ignore */ } },
  };
  socket.on('message', (raw) => {
    let message;
    try { message = JSON.parse(raw.toString('utf8')); } catch { return; }
    messages.push(message);
    for (const waiter of [...waiters]) {
      if (!waiter.predicate(message)) continue;
      clearTimeout(waiter.timer);
      waiters.delete(waiter);
      waiter.resolve(message);
    }
  });
  return client;
}

async function openClient(label, userId) {
  const client = createClient(label, userId);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: WebSocket timeout`)), 8000);
    client.ws.once('open', () => { clearTimeout(timer); resolve(); });
    client.ws.once('error', (error) => { clearTimeout(timer); reject(error); });
  });
  client.send({ type: 'join', userId });
  client.joined = await client.waitFor((m) => m.type === 'joined', 8000, 'joined');
  client.friends = await client.waitFor((m) => m.type === 'friends:state', 8000, 'friends:state');
  return client;
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  try {
    execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } catch { /* ignore */ }
}

fs.rmSync(DATA, { recursive: true, force: true });
fs.mkdirSync(DATA, { recursive: true });
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(PROFILE, { recursive: true });
if (!fs.existsSync(BIN)) throw new Error(`brak pliku ${BIN}`);
if (!fs.existsSync(path.join(WEB_ROOT, 'attachments.js'))) throw new Error('brak attachments.js w zasobach Tauri — uruchom scripts/prepare-tauri-ui.js');

let appLog = '';
const appProcess = spawn(BIN, [], {
  cwd: path.dirname(BIN),
  env: {
    ...process.env,
    CHILL_DATA_DIR: DATA,
    CHILL_PORT: String(PORT),
    CHILL_WEB_ROOT: WEB_ROOT,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${DEBUG_PORT} --disable-features=msWebOOUI,msPdfOOUI`,
    WEBVIEW2_USER_DATA_FOLDER: PROFILE,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
appProcess.stdout.on('data', (chunk) => { appLog += chunk.toString(); });
appProcess.stderr.on('data', (chunk) => { appLog += chunk.toString(); });

let cdp = null;

(async () => {
  try {
    await waitForServer();
    check('serwer Tauri odpowiada na /healthz', true);

    const target = await findPageTarget();
    check('WebView2 udostępnia stronę Chill', Boolean(target.webSocketDebuggerUrl));

    cdp = new CDP(target.webSocketDebuggerUrl);
    await cdp.open();
    const exceptions = [];
    const consoleErrors = [];
    cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
      exceptions.push(exceptionDetails?.exception?.description || exceptionDetails?.text || 'wyjątek');
    });
    cdp.on('Log.entryAdded', ({ entry }) => {
      if (entry?.level === 'error' && !/favicon/i.test(entry.text || '')) consoleErrors.push(entry.text || 'błąd');
    });
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');

    async function evaluate(expression, timeout = 25_000) {
      const result = await cdp.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      }, timeout);
      if (result.exceptionDetails) {
        throw new Error(`evaluate: ${result.exceptionDetails.exception?.description || result.exceptionDetails.text}`);
      }
      return result.result?.value;
    }

    async function waitEval(expression, timeout = 15_000, label = 'warunek') {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const value = await evaluate(expression).catch(() => false);
        if (value) return value;
        await sleep(120);
      }
      throw new Error(`timeout: ${label}`);
    }

    await waitEval("document.readyState === 'complete' && typeof myId !== 'undefined'", 25_000, 'load');
    await waitEval("document.documentElement.dataset.runtime === 'tauri'", 15_000, 'tauri runtime');
    check('strona działa w powłoce Tauri', await evaluate("document.documentElement.dataset.runtime === 'tauri'"));
    await waitEval("getComputedStyle(document.getElementById('loginScreen')).display !== 'none'", 10_000, 'login visible');
    check('ekran rejestracji jest widoczny', true);

    await evaluate(`(() => {
      document.getElementById('tabRegister').click();
      const set = (el, value) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set(document.getElementById('regUsername'), 'tauri_bob');
      set(document.getElementById('regEmail'), 'tauri_bob@example.test');
      set(document.getElementById('regDisplayName'), 'Bob Tauri');
      set(document.getElementById('regPassword'), 'Testowe123!');
      document.getElementById('registerForm').requestSubmit();
      return true;
    })()`);
    await waitEval("getComputedStyle(document.getElementById('loginScreen')).display === 'none'", 25_000, 'registration');
    await waitEval("typeof myId === 'string' && myId.length > 0 && ws && ws.readyState === 1", 20_000, 'socket');
    check('rejestracja w aplikacji Tauri działa', await evaluate("typeof myId === 'string' && myId.length > 0"));
    check('aplikacja łączy WebSocket', await evaluate("ws.readyState === 1"));
    const bobId = await evaluate('myId');

    // Create the server while Bob is the only/local desktop session, so he owns it
    // (registering the second account through the bridge later switches the global
    // desktop session in local mode).
    const created = await evaluate(`(async () => {
      const result = await CHILL.servers.create({ name: 'Tauri Serwer', color: '#3ee0a3' });
      await loadServers();
      renderSidebar();
      return result;
    })()`);
    const server = created?.server;
    check('tworzenie serwera w aplikacji', Boolean(created?.ok && server?.id && server?.invite), JSON.stringify(created).slice(0, 140));
    await waitEval("Array.from(document.querySelectorAll('#serverList .server-btn')).some(b => b.title.includes('Tauri Serwer'))", 12_000, 'server tile');
    check('serwer widoczny w aplikacji', true);

    const cookies = await cdp.send('Network.getCookies', { urls: [ORIGIN] });
    const jarAlice = new Jar();
    let hasWebCookie = false;
    let hasCsrf = false;
    for (const cookie of cookies.cookies || []) {
      if (cookie.name === 'chill_web') hasWebCookie = true;
      if (cookie.name === 'chill_csrf') hasCsrf = true;
      if (cookie.name === 'chill_web' || cookie.name === 'chill_csrf') jarAlice.cookies.set(cookie.name, cookie.value);
    }
    check('powłoka ustawia ciasteczka bezpieczeństwa', hasWebCookie && hasCsrf, `${hasWebCookie} ${hasCsrf}`);

    const registeredAlice = await bridge(jarAlice, 'chill:auth-register', {
      email: 'tauri_alice@example.test',
      username: 'tauri_alice',
      displayName: 'Alicja Tauri',
      password: 'Testowe123!',
    });
    const aliceAccount = registeredAlice.data?.result?.user;
    check('drugie konto powstaje przez mostek aplikacji', Boolean(registeredAlice.data?.ok && aliceAccount?.id));
    const profile = await bridge(jarAlice, 'chill:auth-update-profile', {
      displayName: 'Alicja Tauri',
      about: 'Profil testowy Tauri',
      color: '#7cc8ff',
      avatar: AVATAR,
    });
    check('avatar drugiego konta zapisany', Boolean(profile.data?.ok && profile.data.result?.ok));

    const alice = await openClient('Alice', aliceAccount.id);
    check('drugi klient dołącza lokalnie', alice.joined.userId === aliceAccount.id);
    const aliceInList = (alice.joined.users || []).find((user) => user.id === aliceAccount.id);
    check('lista użytkowników zawiera nazwę i avatar', Boolean(aliceInList?.name === 'Alicja Tauri' && aliceInList?.avatar), JSON.stringify({ name: aliceInList?.name, avatar: Boolean(aliceInList?.avatar) }));

    alice.send({ type: 'friends:request', to: bobId });
    await alice.waitFor((m) => m.type === 'friends:state' && (m.outgoing || []).some((item) => item.id === bobId), 8000, 'outgoing');
    await waitEval("!!document.querySelector('.nav-request.incoming .nav-request-btn.accept')", 12_000, 'incoming request');
    check('zaproszenie do znajomych widoczne w aplikacji', true);
    const requestAvatar = await evaluate(`(() => {
      const avatar = document.querySelector('.nav-request.incoming .nav-avatar');
      return { photo: Boolean(avatar?.classList.contains('avatar-photo')), image: avatar?.style.backgroundImage || '' };
    })()`);
    check('avatar w zaproszeniu w aplikacji', Boolean(requestAvatar.photo && requestAvatar.image.includes('data:image/png')), JSON.stringify(requestAvatar));

    await evaluate("document.querySelector('.nav-request.incoming .nav-request-btn.accept').click()");
    await waitEval("!document.querySelector('.nav-request.incoming')", 12_000, 'accepted');
    const rows = await evaluate("Array.from(document.querySelectorAll('#dmList .nav-item')).filter(b => b.textContent.includes('Alicja Tauri')).length");
    check('znajomy pojawia się raz na liście DM w aplikacji', rows === 1, String(rows));
    const dmAvatar = await evaluate(`(() => {
      const row = Array.from(document.querySelectorAll('#dmList .nav-item')).find(b => b.textContent.includes('Alicja Tauri'));
      const avatar = row?.querySelector('.nav-avatar');
      return { photo: Boolean(avatar?.classList.contains('avatar-photo')), image: avatar?.style.backgroundImage || '', dot: Boolean(avatar?.querySelector(':scope > .status-dot')) };
    })()`);
    check('avatar znajomego w DM w aplikacji', Boolean(dmAvatar.photo && dmAvatar.image.includes('data:image/png')), JSON.stringify(dmAvatar));
    check('kropka statusu w awatarze DM aplikacji', dmAvatar.dot === true);

    await evaluate(`(() => {
      const row = Array.from(document.querySelectorAll('#dmList .nav-item')).find(b => b.textContent.includes('Alicja Tauri'));
      row.click();
      return true;
    })()`);
    await waitEval("current.kind === 'dm' && current.id === '" + aliceAccount.id + "'", 10_000, 'dm view');

    const drop = await evaluate(`(() => {
      const bytes = Uint8Array.from(atob('${PNG}'), (c) => c.charCodeAt(0));
      const file = new File([bytes], 'tauri-zrzut.png', { type: 'image/png' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      document.getElementById('main').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
      const box = document.getElementById('composerAttachment');
      return {
        visible: !box.hidden,
        name: document.getElementById('composerAttachmentName').textContent,
        thumb: document.getElementById('composerAttachmentThumb').style.backgroundImage,
      };
    })()`);
    check('upuszczenie pliku w aplikacji pokazuje podgląd', Boolean(drop.visible && drop.name === 'tauri-zrzut.png'), JSON.stringify(drop));
    check('podgląd obrazu w aplikacji', drop.thumb.includes('blob:'), drop.thumb);

    await evaluate(`(() => {
      const input = document.getElementById('messageInput');
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(input, 'Podpis Tauri');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('composer').requestSubmit();
      return true;
    })()`);
    const dmWithAttachment = await alice.waitFor((m) => m.type === 'dm' && m.message?.text?.includes('chill-file://'), 12_000, 'dm attachment');
    const tokenMatch = /chill-file:\/\/([a-f0-9]{32})\?([^\s]*)/.exec(dmWithAttachment.message.text);
    const tokenParams = new URLSearchParams(tokenMatch ? tokenMatch[2] : '');
    check('załącznik trafia do DM w aplikacji', Boolean(tokenMatch) && tokenParams.get('n') === 'tauri-zrzut.png');
    check('podpis trafia do DM w aplikacji', dmWithAttachment.message.text.includes('Podpis Tauri'));
    await waitEval("!!document.querySelector('#messages .chat-attachment-image')", 15_000, 'attachment bubble');
    const bubble = await evaluate(`(() => {
      const img = document.querySelector('#messages .chat-attachment-image');
      const caption = document.querySelector('#messages .chat-attachment-caption');
      return { src: img?.src || '', caption: caption?.textContent || '', composerHidden: document.getElementById('composerAttachment').hidden };
    })()`);
    check('załącznik renderuje się w aplikacji', bubble.src.includes('/attachment/'), bubble.src.slice(0, 120));
    check('podpis renderuje się w aplikacji', bubble.caption === 'Podpis Tauri', bubble.caption);
    check('kompozytor czyści podgląd w aplikacji', bubble.composerHidden === true);
    const imageResponse = await fetch(bubble.src);
    const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
    check('aplikacja pobiera załącznik z serwera', imageResponse.status === 200 && imageBytes.length > 0, `${imageResponse.status} ${imageBytes.length}`);

    alice.send({
      type: 'join-server',
      serverId: server.id,
      invite: server.invite,
      memberId: aliceAccount.id,
      name: 'Alicja Tauri',
      color: '#7cc8ff',
      avatar: AVATAR,
      handle: 'alicja.tauri',
      about: 'Profil testowy Tauri',
    });
    const joined = await alice.waitFor((m) => m.type === 'server:joined' && m.server?.id === server.id, 8000, 'server joined');
    check('drugi klient dołącza do serwera w aplikacji', joined.you?.memberId === aliceAccount.id, JSON.stringify(joined.you));
    await evaluate("document.querySelector('#serverList .server-btn').click()");
    await waitEval("!!document.querySelector('#channelList .nav-item')", 12_000, 'channels');
    const memberAvatar = await evaluate(`(() => {
      const member = Array.from(document.querySelectorAll('#userList .member')).find(b => b.textContent.includes('Alicja Tauri'));
      const avatar = member?.querySelector('.member-avatar');
      return { found: Boolean(member), photo: Boolean(avatar?.classList.contains('avatar-photo')), image: avatar?.style.backgroundImage || '' };
    })()`);
    check('avatar członka serwera w aplikacji', Boolean(memberAvatar.found && memberAvatar.photo && memberAvatar.image.includes('data:image/png')), JSON.stringify(memberAvatar));

    const channelCreated = await evaluate(`(() => {
      const state = serverState('${server.id}');
      if (!state?.ws) return false;
      state.ws.send(JSON.stringify({ type: 'server:channel:create', name: 'muzyka', channelType: 'voice' }));
      return true;
    })()`);
    check('tworzenie kanału głosowego w aplikacji', channelCreated === true);
    await waitEval("!!document.querySelector('#channelList .nav-item.voice-channel')", 12_000, 'voice channel');
    await evaluate("document.querySelector('#channelList .nav-item.voice-channel').click()");
    await waitEval("!document.getElementById('voiceView').hidden", 12_000, 'voice view');
    check('kanał głosowy otwiera się w aplikacji', await evaluate("document.getElementById('voiceViewName').textContent === 'muzyka'"));
    check('Spotify dostępne na kanale głosowym w aplikacji', await evaluate("document.getElementById('spotifyToggle').hidden === false"));

    await evaluate("document.getElementById('spotifyToggle').click()");
    await waitEval("!document.getElementById('spotifyPanel').hidden", 8000, 'spotify panel');
    check('panel Spotify otwiera się w aplikacji', true);
    await evaluate(`(() => {
      const input = document.getElementById('spotifyInput');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '${SPOTIFY_URL}');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('spotifyForm').requestSubmit();
      return true;
    })()`);
    await waitEval("document.getElementById('spotifyFrame').getAttribute('src') && document.getElementById('spotifyFrame').getAttribute('src').includes('/embed/track/')", 12_000, 'spotify embed');
    const spotify = await evaluate(`(() => ({
      src: document.getElementById('spotifyFrame').getAttribute('src') || '',
      nowHidden: document.getElementById('spotifyNow').hidden,
    }))()`);
    check('Spotify ustawia oficjalny embed w aplikacji', spotify.src.startsWith('https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT'), spotify.src);
    check('odtwarzacz Spotify widoczny w aplikacji', spotify.nowHidden === false);

    await sleep(400);
    check('brak wyjątków JavaScript w aplikacji', exceptions.length === 0, exceptions.slice(0, 3).join(' | '));
    const seriousConsole = consoleErrors.filter((text) => !/Failed to load resource|net::ERR/i.test(text));
    check('brak błędów konsoli w aplikacji', seriousConsole.length === 0, seriousConsole.slice(0, 3).join(' | '));

    alice.close();
  } catch (error) {
    failed += 1;
    failures.push('wyjątek');
    console.error(`FAIL wyjątek — ${error.stack || error.message}`);
    console.error(appLog.slice(-3000));
  } finally {
    if (cdp) cdp.close();
    killTree(appProcess);
    await sleep(600);
    console.log(`\nWynik: ${passed}/${passed + failed}${failed ? `, błędy: ${failures.join(', ')}` : ''}`);
    process.exit(failed ? 1 : 0);
  }
})();
