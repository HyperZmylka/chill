'use strict';

// Tauri mini-games smoke: launches "Last Circle" (battle royale) in the real
// desktop WebView, verifies the 3D canvas renders, WASD/sprint/jump/aim/shoot
// work, bots fight and the storm shrinks, captures a screenshot and asserts
// there are no JS exceptions.
//
// Run: node test/minigames-smoke.js
// Uses the debug binary by default; set E2E_BIN to test another build.
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const WebSocket = require('ws');

const ROOT = path.resolve(__dirname, '..');
const BASE = path.join(os.tmpdir(), 'opencode', 'chill-test');
const DATA = path.join(BASE, 'minigames-data');
const PROFILE = path.join(BASE, 'minigames-profile');
const PORT = Number(process.env.E2E_PORT || 47991);
const DEBUG_PORT = Number(process.env.E2E_DEBUG_PORT || 47992);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BIN = process.env.E2E_BIN || path.join(ROOT, 'rust', 'target', 'debug', 'chill-desktop.exe');
const WEB_ROOT = path.join(ROOT, 'rust', 'chill-desktop', 'assets');
const SHOT = path.join(os.tmpdir(), 'opencode', 'chill-last-circle.png');

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
fs.rmSync(SHOT, { force: true });
if (!fs.existsSync(BIN)) throw new Error(`brak pliku ${BIN}`);
if (!fs.existsSync(path.join(WEB_ROOT, 'minigames.js'))) throw new Error('brak minigames.js w zasobach Tauri — uruchom scripts/prepare-tauri-ui.js');

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
    await waitEval("document.documentElement.dataset.runtime === 'tauri'", 15_000, 'tauri runtime');
    await waitEval("getComputedStyle(document.getElementById('loginScreen')).display !== 'none'", 10_000, 'login visible');

    await evaluate(`(() => {
      document.getElementById('tabRegister').click();
      const set = (el, value) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set(document.getElementById('regUsername'), 'royale_tauri');
      set(document.getElementById('regEmail'), 'royale_tauri@example.test');
      set(document.getElementById('regDisplayName'), 'Royale Tauri');
      set(document.getElementById('regPassword'), 'Testowe123!');
      document.getElementById('registerForm').requestSubmit();
      return true;
    })()`);
    await waitEval("getComputedStyle(document.getElementById('loginScreen')).display === 'none' && typeof myId === 'string' && myId.length > 0", 25_000, 'registration');
    check('rejestracja w aplikacji Tauri działa', true);

    const opened = await evaluate(`(() => {
      miniGamesInstalled = ['last-circle'];
      saveMiniGamesInstalled();
      selectMiniGames();
      launchMiniGame('last-circle');
      const overlay = document.getElementById('minigameOverlay');
      const splash = document.getElementById('minigameSplash');
      return {
        overlayVisible: !overlay.hidden,
        splashVisible: !splash.hidden,
        title: document.getElementById('minigameSplashTitle').textContent,
        controls: document.getElementById('minigameSplashControls').textContent,
        catalog: CHILL_MINIGAMES.catalog.map((game) => game.id),
      };
    })()`);
    check('Ostatni Krąg uruchamia się z katalogu Mini Gierek', Boolean(opened.overlayVisible && opened.splashVisible && opened.title === 'Ostatni Krąg'), JSON.stringify(opened).slice(0, 220));
    check('katalog zawiera oryginalne gry Chill', Array.isArray(opened.catalog) && opened.catalog.length === 2, JSON.stringify(opened.catalog));
    check('sterowanie battle royale jest opisane', /WASD/.test(opened.controls) && /LPM/.test(opened.controls), opened.controls);

    await evaluate("document.getElementById('minigameSplashPrimary').click()");
    await sleep(1200);
    const render = await evaluate(`(() => {
      const session = miniGameSession;
      const canvas = document.getElementById('minigameCanvas');
      const ctx = canvas.getContext('2d');
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const colors = new Set();
      for (let i = 0; i < data.length; i += 4 * 97) colors.add(data[i] + ',' + data[i + 1] + ',' + data[i + 2]);
      return {
        running: session.running,
        time: Number(session.time.toFixed(2)),
        width: canvas.width,
        height: canvas.height,
        colors: colors.size,
        bots: session.bots.length,
        player: { hp: session.player.hp, x: session.player.x, z: session.player.z },
        hud: document.getElementById('minigameHud').innerText.replace(/\\n+/g, ' | '),
      };
    })()`);
    check('gra renderuje trójwymiarową scenę na canvasie', render.width > 800 && render.height > 500 && render.colors > 150, JSON.stringify(render).slice(0, 220));
    check('na arenie jest 12 graczy (gracz + boty)', render.bots === 11 && render.player.hp === 100, `bots=${render.bots} hp=${render.player.hp}`);
    check('HUD pokazuje HP, broń i strefę', /HP/.test(render.hud) && /Pistolet/.test(render.hud) && /STREFA/.test(render.hud), render.hud.slice(0, 180));

    // Drive the simulation deterministically so the test does not depend on
    // the WebView being foregrounded (requestAnimationFrame can be throttled).
    const gameplay = await evaluate(`(() => {
      const session = miniGameSession;
      cancelAnimationFrame(session.raf);
      session.running = true;
      session.paused = false;
      const realRaf = window.requestAnimationFrame;
      window.requestAnimationFrame = () => 0;
      const realDraw = session.draw;
      session.draw = () => {};
      let t = session.last;
      const step = (frames) => {
        for (let i = 0; i < frames; i += 1) {
          t += 50;
          session.frame(t);
          if (!session.running || session.ended) break;
        }
      };
      const key = (type, code, keyName) => window.dispatchEvent(new KeyboardEvent(type, { code, key: keyName, bubbles: true, cancelable: true }));
      const start = { x: session.player.x, z: session.player.z, time: session.time };
      key('keydown', 'KeyW', 'w');
      key('keydown', 'ShiftLeft', 'Shift');
      step(30);
      key('keyup', 'KeyW', 'w');
      key('keyup', 'ShiftLeft', 'Shift');
      const movedDistance = Math.hypot(session.player.x - start.x, session.player.z - start.z);

      key('keydown', 'Space', ' ');
      step(4);
      const airborneY = session.player.y;
      key('keyup', 'Space', ' ');
      step(20);
      const landedY = session.player.y;

      const yawBefore = session.camera.yaw;
      key('keydown', 'ArrowRight', 'ArrowRight');
      step(15);
      key('keyup', 'ArrowRight', 'ArrowRight');
      const yawDelta = Math.abs(session.camera.yaw - yawBefore);

      const canvas = document.getElementById('minigameCanvas');
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 7, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, bubbles: true }));
      step(20);
      window.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerId: 7, bubbles: true }));
      const shots = session.stats.shots;
      const ammo = session.player.mag;

      step(500);
      window.requestAnimationFrame = realRaf;
      session.draw = realDraw;
      session.draw();
      return {
        simulatedSeconds: Number((session.time - start.time).toFixed(1)),
        movedDistance: Number(movedDistance.toFixed(2)),
        airborneY: Number(airborneY.toFixed(2)),
        landedY: Number(landedY.toFixed(2)),
        yawDelta: Number(yawDelta.toFixed(2)),
        shots,
        ammo,
        stats: session.stats,
        elapsed: Number(session.storm.elapsed.toFixed(1)),
        aliveBots: session.bots.filter((bot) => bot.alive && (bot.hp ?? 1) > 0).length,
        playerAlive: session.player.alive,
        playerHp: session.player.hp,
        ended: session.ended,
        hud: document.getElementById('minigameHud').innerText.replace(/\\n+/g, ' | '),
      };
    })()`, 120_000);
    check('WASD + sprint przesuwa gracza', gameplay.movedDistance > 5, JSON.stringify(gameplay).slice(0, 200));
    check('spacja daje skok, gracz ląduje', gameplay.airborneY > 0.2 && gameplay.landedY < 0.1, `y=${gameplay.airborneY} → ${gameplay.landedY}`);
    check('mysz/strzałki obracają kamerę', gameplay.yawDelta > 0.5, String(gameplay.yawDelta));
    check('LPM strzela i zużywa amunicję', gameplay.shots >= 1 && gameplay.ammo < 12, `shots=${gameplay.shots} ammo=${gameplay.ammo}`);
    check('boty walczą między sobą', gameplay.aliveBots < 11, `${gameplay.aliveBots}/11`);
    check('strefa kurczy się po okresie oczekiwania', gameplay.elapsed > 20 && /KURCZY|SHRINK/.test(gameplay.hud), gameplay.hud.slice(0, 200));
    check('gracz przeżył symulację bez końca gry', gameplay.playerAlive && !gameplay.ended, JSON.stringify({ hp: gameplay.playerHp, ended: gameplay.ended }));

    // Force one more paint and capture the WebView so the result is inspectable.
    await evaluate("miniGameSession.draw()");
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' }, 30_000);
    fs.writeFileSync(SHOT, Buffer.from(screenshot.data, 'base64'));
    check('zrzut ekranu gry zapisany', fs.statSync(SHOT).size > 20_000, SHOT);
    check('brak wyjątków JavaScript w grze', exceptions.length === 0, exceptions.slice(0, 3).join(' | '));

    console.log(`Screenshot: ${SHOT}`);
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
