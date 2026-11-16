'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');

function block(start, end) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `missing ${start}`);
  const to = source.indexOf(end, from);
  assert.ok(to > from, `missing ${end}`);
  return source.slice(from, to);
}

test('joining an invite uses the logged-in account as stable identity', () => {
  const join = block('async function joinServerInvite', 'async function joinServer()');
  assert.match(join, /const accountId = String\(myId \|\| ''\)\.slice\(0, 64\)/);
  assert.match(join, /const memberId = accountId \|\| randomMemberId\(\)/);
  assert.match(join, /probeServer\(parsed, \{ memberId, accountId \}\)/);
  assert.match(join, /data\?\.you\?\.memberId/);
  assert.doesNotMatch(join, /const memberId = randomMemberId\(\)/);
});

test('known servers are reused by invite even after the address changes', () => {
  const join = block('async function joinServerInvite', 'async function joinServer()');
  assert.match(join, /servers\.find\(\(server\) => server\.invite === parsed\.invite\)/);
  assert.match(join, /known\.address !== parsed\.address/);
  assert.match(join, /persistJoinedServer\(updated\)/);
});

test('server sockets send both the member and account identity', () => {
  const connect = block('function connectServer', 'socket.onmessage');
  assert.match(connect, /const memberId = server\.owner \? myId : \(server\.memberId \|\| myId\)/);
  assert.match(connect, /accountId: myId/);
  const probe = block('async function probeServer', 'function bindServers');
  assert.match(probe, /const accountId = String\(identity\.accountId \|\| myId \|\| ''\)\.slice\(0, 64\)/);
  assert.match(probe, /accountId,/);
});

test('the host-returned member id is remembered and persisted', () => {
  assert.match(source, /rememberServerMemberId\(state\.server, state\.you\?\.memberId\)/);
  const helper = block('function rememberServerMemberId', 'function unreadCountFor');
  assert.match(helper, /entry\.memberId = id/);
  assert.match(helper, /persistJoinedServer\(entry, id\)/);
});

test('stale server friend entries are remapped after duplicate cleanup', () => {
  const sync = block('function syncServerFriends', 'function renderDmList');
  assert.match(sync, /friend\.memberId = member\.id/);
  assert.match(sync, /friend\.dmId = serverFriendId\(serverId, member\.id\)/);
});
