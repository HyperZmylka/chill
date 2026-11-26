'use strict';

// Powtarzalny benchmark serwera Chill. Uruchamia podany binarny plik na
// tymczasowym katalogu danych, mierzy start, pamięć, opóźnienie wiadomości,
// rozmiar i czas odpowiedzi statycznych oraz rewalidację ETag.
//
// Użycie:
//   node scripts/bench-server.js ./rust/target/release/chill-server.exe chill 47991 ./dist-web
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const WebSocket = require('ws');

const binary = process.argv[2] || './rust/target/release/chill-server.exe';
const label = process.argv[3] || 'chill';
const port = Number(process.argv[4] || 47991);
const webRoot = path.resolve(process.argv[5] || '.');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `chill-bench-${label}-`));
const base = `http://127.0.0.1:${port}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

async function waitForServer(timeoutMs = 15000) {
  const started = process.hrtime.bigint();
  for (;;) {
    try {
      const response = await fetch(`${base}/healthz`);
      if (response.ok) {
        await response.text();
        return Number(process.hrtime.bigint() - started) / 1e6;
      }
    } catch {
      // serwer jeszcze nie nasłuchuje
    }
    if (Number(process.hrtime.bigint() - started) / 1e6 > timeoutMs) {
      throw new Error('server start timeout');
    }
    await sleep(4);
  }
}

function cookiesFrom(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  return values.map((value) => value.split(';')[0]);
}

async function bridge(cookies, channel, payload) {
  const csrf = cookies.find((value) => value.startsWith('chill_csrf=')) || '';
  const response = await fetch(`${base}/api/bridge`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-chill-csrf': csrf.split('=')[1] || '',
      cookie: cookies.join('; '),
    },
    body: JSON.stringify({ channel, payload }),
  });
  const body = await response.json();
  return { body, cookies: cookies.concat(cookiesFrom(response)) };
}

function wsConnect(cookies) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${base.replace('http', 'ws')}/chat`, {
      headers: { cookie: cookies.join('; ') },
    });
    const queue = [];
    const waiters = [];
    socket.on('message', (raw) => {
      let value;
      try {
        value = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const index = waiters.findIndex((waiter) => waiter.test(value));
      if (index >= 0) {
        const [waiter] = waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(value);
      } else {
        queue.push(value);
      }
    });
    socket.once('error', reject);
    socket.once('open', () => {
      resolve({
        socket,
        send(value) {
          socket.send(JSON.stringify(value));
        },
        wait(test, timeoutMs = 10000) {
          const queued = queue.findIndex(test);
          if (queued >= 0) {
            return Promise.resolve(queue.splice(queued, 1)[0]);
          }
          return new Promise((resolveWait, rejectWait) => {
            const waiter = {
              test,
              resolve: resolveWait,
              timer: setTimeout(() => {
                const index = waiters.indexOf(waiter);
                if (index >= 0) waiters.splice(index, 1);
                rejectWait(new Error('websocket event timeout'));
              }, timeoutMs),
            };
            waiters.push(waiter);
          });
        },
      });
    });
  });
}

async function measure(url, headers, iterations = 200) {
  const times = [];
  let bytes = 0;
  let encoding = 'identity';
  for (let index = 0; index < iterations; index += 1) {
    const started = process.hrtime.bigint();
    const response = await fetch(url, { headers });
    const buffer = Buffer.from(await response.arrayBuffer());
    times.push(Number(process.hrtime.bigint() - started) / 1e6);
    bytes = Number(response.headers.get('content-length') || buffer.length);
    encoding = response.headers.get('content-encoding') || 'identity';
  }
  return {
    bytes,
    encoding,
    p50: percentile(times, 0.5).toFixed(2),
    p95: percentile(times, 0.95).toFixed(2),
  };
}

function memory(pid) {
  if (process.platform === 'win32') {
    try {
      const output = execFileSync('powershell.exe', [
        '-NoProfile',
        '-Command',
        `(Get-Process -Id ${pid}).WorkingSet64`,
      ], { encoding: 'utf8' });
      return Number(output.trim());
    } catch {
      return 0;
    }
  }
  try {
    const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
    const match = status.match(/VmRSS:\s+(\d+) kB/);
    return match ? Number(match[1]) * 1024 : 0;
  } catch {
    return 0;
  }
}

async function main() {
  const child = spawn(binary, [], {
    env: {
      ...process.env,
      CHILL_DATA_DIR: dataDir,
      CHILL_WEB_ROOT: webRoot,
      CHILL_PORT: String(port),
      CHILL_HOST: '127.0.0.1',
      CHILL_PUBLIC_WEB: '0',
      CHILL_BUILD_ID: 'bench',
    },
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true,
  });

  try {
    const startupMs = await waitForServer();
    await sleep(80);
    const idleMemory = memory(child.pid);

    let response = await fetch(`${base}/`);
    let cookies = cookiesFrom(response);
    await response.arrayBuffer();

    const register = await bridge(cookies, 'chill:auth-register', {
      username: 'benchuser',
      displayName: 'Bench User',
      password: 'password123',
      email: '',
    });
    cookies = register.cookies;
    const userId = register.body.result.user.id;

    const created = await bridge(cookies, 'chill:servers-create', {
      name: 'Bench Server',
      color: '#3ee0a3',
    });
    cookies = created.cookies;
    const server = created.body.result.server;
    const channelId = server.channels[0].id;

    const ws = await wsConnect(cookies);
    ws.send({ type: 'join', userId });
    await ws.wait((value) => value.type === 'joined');
    ws.send({
      type: 'join-server',
      invite: server.invite,
      serverId: server.id,
      ownerKey: server.ownerKey,
      accountId: userId,
      memberId: userId,
      name: 'Bench User',
    });
    await ws.wait((value) => value.type === 'server:joined' || value.type === 'server:error');

    const messageTimes = [];
    for (let index = 0; index < 120; index += 1) {
      const text = `Benchmark message ${index}`;
      const started = process.hrtime.bigint();
      ws.send({
        type: 'server:message',
        channelId,
        text,
        clientId: `bench-${index}`,
      });
      await ws.wait((value) => value.type === 'server:message' && value.message.text === text);
      messageTimes.push(Number(process.hrtime.bigint() - started) / 1e6);
    }

    await sleep(250);
    const serversPath = path.join(dataDir, 'servers.json');
    const serversSize = fs.existsSync(serversPath) ? fs.statSync(serversPath).size : 0;

    const version = await measure(`${base}/api/version`, {}, 300);
    const rawAsset = await measure(`${base}/renderer.js`, {}, 60);
    const brAsset = await measure(`${base}/renderer.js`, { 'accept-encoding': 'br' }, 60);
    const etag = (await fetch(`${base}/renderer.js`, {
      headers: { 'accept-encoding': 'br' },
    })).headers.get('etag');
    let revalidatedMs = 0;
    let revalidatedStatus = 0;
    {
      const started = process.hrtime.bigint();
      const cached = await fetch(`${base}/renderer.js`, {
        headers: { 'accept-encoding': 'br', 'if-none-match': etag },
      });
      await cached.arrayBuffer();
      revalidatedMs = Number(process.hrtime.bigint() - started) / 1e6;
      revalidatedStatus = cached.status;
    }

    const peakMemory = memory(child.pid);
    ws.socket.close();
    await sleep(50);

    console.log(JSON.stringify({
      label,
      startupMs: startupMs.toFixed(1),
      idleMemoryMB: (idleMemory / 1024 / 1024).toFixed(1),
      peakMemoryMB: (peakMemory / 1024 / 1024).toFixed(1),
      versionP50: version.p50,
      versionP95: version.p95,
      rawAssetBytes: rawAsset.bytes,
      rawAssetEncoding: rawAsset.encoding,
      rawAssetP50: rawAsset.p50,
      brAssetBytes: brAsset.bytes,
      brAssetEncoding: brAsset.encoding,
      brAssetP50: brAsset.p50,
      revalidatedMs: revalidatedMs.toFixed(2),
      revalidatedStatus,
      messageP50: percentile(messageTimes, 0.5).toFixed(2),
      messageP95: percentile(messageTimes, 0.95).toFixed(2),
      messageMax: Math.max(...messageTimes).toFixed(2),
      serversJsonBytes: serversSize,
    }, null, 2));
  } finally {
    child.kill();
    await sleep(100);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
