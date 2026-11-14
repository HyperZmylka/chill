'use strict';

// Tauri deep-link smoke: registers the chill:// scheme, then opens
// chill://host:port/INVITE while the app is running and verifies the invite is
// received through the single-instance plugin and the server gets selected.
//
// Run: node test/tauri-deeplink.js
// Uses the debug binary by default; set E2E_BIN to test another build.
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const WebSocket = require('ws');

const ROOT = path.resolve(__dirname, '..');
const BASE = path.join(os.tmpdir(), 'opencode', 'chill-test');
const DATA = path.join(BASE, 'tauri-deeplink-data');
const PROFILE = path.join(BASE, 'tauri-deeplink-profile');
const PORT = Number(process.env.E2E_PORT || 47961);
const DEBUG_PORT = Number(process.env.E2E_DEBUG_PORT || 47962);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BIN = process.env.E2E_BIN || path.join(ROOT, 'rust', 'target', 'debug', 'chill-desktop.exe');
const WEB_ROOT = path.join(ROOT, 'rust', 'chill-desktop', 'assets');

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

class CDP {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.handlers = new Map(); }
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
    const deadline = Date.now() + 30_000;
    let healthy = false;
    while (Date.now() < deadline) {
      try { if ((await fetch(`${ORIGIN}/healthz`)).ok) { healthy = true; break; } } catch { /* not ready */ }
      await sleep(200);
    }
    check('serwer Tauri odpowiada na /healthz', healthy);

    const target = await findPageTarget();
    cdp = new CDP(target.webSocketDebuggerUrl);
    await cdp.open();
    const exceptions = [];
    cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
      exceptions.push(exceptionDetails?.exception?.description || exceptionDetails?.text || 'wyjątek');
    });
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');

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
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        const value = await evaluate(expression).catch(() => false);
        if (value) return value;
        await sleep(120);
      }
      throw new Error(`timeout: ${label}`);
    }

    await waitEval("document.readyState === 'complete' && typeof myId !== 'undefined'", 25_000, 'load');
    await waitEval("getComputedStyle(document.getElementById('loginScreen')).display !== 'none'", 10_000, 'login');

    await evaluate(`(() => {
      document.getElementById('tabRegister').click();
      const set = (el, value) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set(document.getElementById('regUsername'), 'deep_bob');
      set(document.getElementById('regEmail'), 'deep_bob@example.test');
      set(document.getElementById('regDisplayName'), 'Bob Deep');
      set(document.getElementById('regPassword'), 'Testowe123!');
      document.getElementById('registerForm').requestSubmit();
      return true;
    })()`);
    await waitEval("getComputedStyle(document.getElementById('loginScreen')).display === 'none' && typeof myId === 'string' && myId.length > 0", 25_000, 'registration');
    check('rejestracja bohatera testu działa', true);

    const created = await evaluate(`(async () => {
      const result = await CHILL.servers.create({ name: 'Deep Serwer', color: '#3ee0a3' });
      await loadServers();
      renderSidebar();
      return result;
    })()`);
    const server = created?.server;
    check('serwer do testu linku powstaje', Boolean(created?.ok && server?.id && server?.invite), JSON.stringify(created).slice(0, 160));
    await waitEval("Array.from(document.querySelectorAll('#serverList .server-btn')).some(b => b.title.includes('Deep Serwer'))", 12_000, 'server tile');

    const link = `chill://127.0.0.1:${PORT}/${server.invite}`;
    try {
      execFileSync('cmd', ['/c', 'start', '', link], { stdio: 'ignore', windowsHide: true });
    } catch (error) {
      check('Windows otwiera link chill://', false, error.message);
    }

    await waitEval(`activeServerId === '${server.id}'`, 20_000, 'deep link selects server')
      .then(() => check('link chill:// otwiera właściwy serwer', true))
      .catch((error) => check('link chill:// otwiera właściwy serwer', false, error.message));

    const pending = await evaluate("sessionStorage.getItem('chill.pendingInvite') || ''");
    check('link został odebrany i zużyty', pending === '', pending);
    await sleep(500);
    check('brak wyjątków JavaScript', exceptions.length === 0, exceptions.slice(0, 3).join(' | '));
  } catch (error) {
    failed += 1;
    failures.push('wyjątek');
    console.error(`FAIL wyjątek — ${error.stack || error.message}`);
    console.error(appLog.slice(-2500));
  } finally {
    if (cdp) cdp.close();
    killTree(appProcess);
    await sleep(600);
    console.log(`\nWynik: ${passed}/${passed + failed}${failed ? `, błędy: ${failures.join(', ')}` : ''}`);
    process.exit(failed ? 1 : 0);
  }
})();
