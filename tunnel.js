// Chill — dostęp do serwera spoza sieci lokalnej.
// Uruchamia tymczasowy tunel Cloudflare (cloudflared) bez konta i bez
// konfigurowania przekierowania portów na routerze.
'use strict';

const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');

const CLOUDFLARED_VERSION = '2026.10.7';
const CLOUDFLARED_SHA256 = '2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343';
const CLOUDFLARED_URL = `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-windows-amd64.exe`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function download(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('Zbyt wiele przekierowań podczas pobierania.'));
      return;
    }
    const request = https.get(url, { headers: { 'user-agent': 'Chill' } }, (response) => {
      const status = Number(response.statusCode) || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        const next = new URL(response.headers.location, url).toString();
        download(next, destination, redirects + 1).then(resolve, reject);
        return;
      }
      if (status !== 200) {
        response.resume();
        reject(new Error(`Serwer pobierania odpowiedział kodem ${status}.`));
        return;
      }
      const file = fs.createWriteStream(destination);
      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        file.destroy();
        reject(error);
      };
      file.on('error', fail);
      file.on('finish', () => {
        if (settled) return;
        settled = true;
        file.close(() => resolve());
      });
      response.on('error', fail);
      response.pipe(file);
    });
    request.setTimeout(60_000, () => request.destroy(new Error('Przekroczono czas pobierania.')));
    request.on('error', reject);
  });
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex').toLowerCase()));
  });
}

function fetchStatus(url, timeout = 8_000) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'user-agent': 'Chill' } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        if (body.length < 4_000) body += chunk;
      });
      response.on('end', () => resolve({ status: Number(response.statusCode) || 0, body }));
      response.on('error', reject);
    });
    request.setTimeout(timeout, () => request.destroy(new Error('Przekroczono czas sprawdzania tunelu.')));
    request.on('error', reject);
  });
}

class InternetTunnel {
  constructor({ dir, port, onStatus = null }) {
    this.dir = dir;
    this.port = port;
    this.onStatus = typeof onStatus === 'function' ? onStatus : null;
    this.exePath = path.join(dir, 'cloudflared.exe');
    this.child = null;
    this.endpoint = null;
    this.ensurePromise = null;
    this.log = '';
    this.state = 'idle';
    this.error = '';
    this.lastCheck = 0;
    this.stopping = false;
  }

  setState(state, error = '') {
    this.state = state;
    this.error = error;
    if (this.onStatus) {
      try {
        this.onStatus({ state, error, endpoint: this.endpoint });
      } catch { /* ignorujemy błędy obserwatora */ }
    }
  }

  status() {
    return {
      state: this.state,
      error: this.error,
      endpoint: this.endpoint ? { host: this.endpoint.host, port: this.endpoint.port, secure: true } : null,
    };
  }

  async ensure() {
    if (this.endpoint && this.child && this.child.exitCode === null) {
      if (Date.now() - this.lastCheck < 120_000) return this.endpoint;
      try {
        await this.checkHealth();
        return this.endpoint;
      } catch {
        this.stop();
      }
    }
    if (this.ensurePromise) return this.ensurePromise;
    this.ensurePromise = this.start().finally(() => {
      this.ensurePromise = null;
    });
    return this.ensurePromise;
  }

  async start() {
    this.stopping = false;
    this.setState('preparing');
    try {
      await this.ensureBinary();
      const url = await this.startProcess();
      await this.waitForHealth(url);
      const host = new URL(url).hostname.toLowerCase();
      this.endpoint = { url, host, port: 443, secure: true };
      this.lastCheck = Date.now();
      this.setState('ready');
      console.log(`[tunnel] Gotowy: ${url}`);
      return this.endpoint;
    } catch (error) {
      this.stop();
      const message = String(error?.message || error || 'Nie udało się uruchomić tunelu.');
      this.setState('error', message);
      console.error('[tunnel]', message);
      throw error;
    }
  }

  async ensureBinary() {
    fs.mkdirSync(this.dir, { recursive: true });
    if (fs.existsSync(this.exePath)) {
      const hash = await sha256File(this.exePath);
      if (hash === CLOUDFLARED_SHA256) return;
      try { fs.unlinkSync(this.exePath); } catch { /* plik mógł zniknąć */ }
    }
    this.setState('downloading');
    console.log('[tunnel] Pobieram cloudflared…');
    const part = `${this.exePath}.part`;
    try { fs.unlinkSync(part); } catch { /* brak pliku */ }
    await download(CLOUDFLARED_URL, part);
    const hash = await sha256File(part);
    if (hash !== CLOUDFLARED_SHA256) {
      try { fs.unlinkSync(part); } catch { /* ignore */ }
      throw new Error('Pobrany plik tunelu ma nieprawidłową sumę kontrolną.');
    }
    fs.renameSync(part, this.exePath);
  }

  startProcess() {
    return new Promise((resolve, reject) => {
      this.log = '';
      let url = '';
      let ready = false;
      let settled = false;
      let timer = null;
      const child = spawn(this.exePath, [
        'tunnel',
        '--url', `http://127.0.0.1:${this.port}`,
        '--no-autoupdate',
        '--protocol', 'http2',
      ], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.child = child;

      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };
      const onData = (chunk) => {
        const text = chunk.toString('utf8');
        this.log = `${this.log}${text}`.slice(-20_000);
        const match = this.log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
        if (match) url = match[0];
        if (/Registered tunnel connection/i.test(this.log)) ready = true;
        if (url && ready) finish(resolve, url);
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      child.on('error', (error) => finish(reject, error));
      child.on('exit', (code, signal) => {
        if (this.child === child) this.child = null;
        if (this.endpoint) {
          this.endpoint = null;
          this.setState('error', 'Tunel został rozłączony.');
        }
        if (!settled) {
          finish(reject, new Error(`Tunel zakończył pracę (${code ?? signal ?? 'nieznany błąd'}).`));
        }
      });

      this.setState('starting');
      timer = setTimeout(() => {
        finish(reject, new Error('Tunel nie odpowiedział w wyznaczonym czasie.'));
        this.stop();
      }, 45_000);
    });
  }

  async waitForHealth(url) {
    const deadline = Date.now() + 30_000;
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        const result = await fetchStatus(`${url}/`);
        if (result.status === 200 && result.body.includes('"app":"chill"')) return;
        lastError = new Error(`Tunel odpowiedział kodem ${result.status}.`);
      } catch (error) {
        lastError = error;
      }
      if (this.stopping) throw new Error('Tunel został zatrzymany.');
      await sleep(1_000);
    }
    throw lastError || new Error('Tunel nie odpowiada.');
  }

  async checkHealth() {
    if (!this.endpoint) throw new Error('Tunel nie jest gotowy.');
    const result = await fetchStatus(`${this.endpoint.url}/`);
    if (result.status !== 200 || !result.body.includes('"app":"chill"')) {
      throw new Error(`Tunel odpowiedział kodem ${result.status}.`);
    }
    this.lastCheck = Date.now();
  }

  stop() {
    this.stopping = true;
    this.endpoint = null;
    this.lastCheck = 0;
    const child = this.child;
    this.child = null;
    if (child && child.exitCode === null) {
      try { child.kill(); } catch { /* proces mógł już zniknąć */ }
    }
    if (this.state !== 'error') this.setState('idle');
  }
}

module.exports = {
  InternetTunnel,
  CLOUDFLARED_VERSION,
  CLOUDFLARED_SHA256,
  CLOUDFLARED_URL,
};
