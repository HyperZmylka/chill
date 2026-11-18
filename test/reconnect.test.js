'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const renderer = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
const wsSource = fs.readFileSync(path.join(__dirname, '..', 'rust', 'chill-server', 'src', 'ws.rs'), 'utf8');

test('klient wysyła heartbeat, żeby proxy nie zamykało bezczynnego gniazda', () => {
  assert.match(renderer, /const SOCKET_HEARTBEAT_MS = 25_000;/);
  assert.match(renderer, /socket\.send\('\{"type":"ping"\}'\)/);
  const starts = renderer.match(/startSocketHeartbeat\(socket\);/g) || [];
  assert.ok(starts.length >= 2, `oczekiwano heartbeatu dla obu gniazd, jest ${starts.length}`);
  assert.match(renderer, /stopSocketHeartbeat\(socket\);\s*\n\s*ws = null;/);
});

test('serwer odpowiada na aplikacyjny ping', () => {
  assert.match(wsSource, /"ping" => send\(state, conn_id, &json!\(\{ "type": "pong" \}\)\)/);
});

test('wiadomości wysłane w trakcie rozłączenia czekają w kolejce', () => {
  assert.match(renderer, /const mainOutbox = \[\];/);
  assert.match(renderer, /const serverOutboxes = new Map\(\);/);
  assert.match(renderer, /function queueServerMessage\(/);
  assert.match(renderer, /function flushOutbox\(/);
  assert.match(renderer, /queueServerMessage\(state\.server\.id, payload\);/);
  assert.match(renderer, /pushOutbox\(mainOutbox, payload\);/);
  assert.match(renderer, /flushOutbox\(mainOutbox, ws\)/);
  assert.match(renderer, /flushOutbox\(outbox, state\.ws\)/);
  assert.match(renderer, /Łączę ponownie — wiadomość wyślę automatycznie\./);
});

test('krótkie rozłączenie nie ukrywa czatu ani kompozytora', () => {
  assert.match(renderer, /state\.status = !state\.fatal && state\.attempts <= 5 \? 'reconnecting' : 'offline';/);
  assert.match(renderer, /state\.status !== 'online' && state\.status !== 'reconnecting'/);
  assert.match(renderer, /state\?\.status === 'online' \|\| state\?\.status === 'reconnecting'/);
  assert.match(renderer, /\['online', 'reconnecting'\]\.includes\(serverState\(entry\.serverId\)\?\.status\)/);
});

test('powrót do okna lub sieci od razu ponawia połączenia', () => {
  assert.match(renderer, /function reconnectStaleSockets\(/);
  assert.match(renderer, /window\.addEventListener\('online', reconnectStaleSockets\);/);
  assert.match(renderer, /window\.addEventListener\('focus', reconnectStaleSockets\);/);
  assert.match(renderer, /document\.addEventListener\('visibilitychange', \(\) => \{\s*\n\s*if \(!document\.hidden\) reconnectStaleSockets\(\);/);
});
