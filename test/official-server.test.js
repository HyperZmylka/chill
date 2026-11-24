'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const bridge = fs.readFileSync(
  path.join(__dirname, '..', 'rust', 'chill-server', 'src', 'bridge.rs'),
  'utf8',
);

test('serwer Chill ma stały kod zaproszenia i nazwę w obu backendach', () => {
  assert.match(main, /const OFFICIAL_SERVER_NAME = 'Chill';/);
  assert.match(main, /const OFFICIAL_SERVER_INVITE = 'CHILL';/);
  assert.match(bridge, /const OFFICIAL_SERVER_NAME: &str = "Chill";/);
  assert.match(bridge, /const OFFICIAL_SERVER_INVITE: &str = "CHILL";/);
});

test('Node dodaje konto do serwera Chill przy rejestracji, logowaniu i liście serwerów', () => {
  assert.match(main, /function ensureOfficialMembership\(user, ctx = \{\}\)/);
  assert.match(main, /if \(!server \|\| server\.ownerId === user\.id\) return false;/);
  assert.match(main, /entry = \{ userId: user\.id, id: server\.id, joinedAt: Date\.now\(\), memberId: user\.id \};/);

  const register = main.slice(
    main.indexOf("registerIpcHandler('chill:auth-register'"),
    main.indexOf("registerIpcHandler('chill:auth-login'"),
  );
  assert.match(register, /ensureOfficialMembership\(user, webContext\(e\)\);/);

  const login = main.slice(
    main.indexOf("registerIpcHandler('chill:auth-login'"),
    main.indexOf("registerIpcHandler('chill:auth-logout'"),
  );
  assert.match(login, /ensureOfficialMembership\(user, webContext\(e\)\);/);

  const list = main.slice(
    main.indexOf("registerIpcHandler('chill:servers-list'"),
    main.indexOf("registerIpcHandler('chill:servers-create'"),
  );
  assert.match(list, /ensureOfficialMembership\(current, ctx\);/);
});

test('Rust dodaje konto do serwera Chill przy rejestracji, logowaniu i liście serwerów', () => {
  assert.match(bridge, /fn ensure_official_membership\(state: &AppState, user: &Account, ctx: &BridgeContext\) -> bool/);
  assert.match(bridge, /if official\.owner_id == user\.id \{/);
  assert.match(bridge, /member_id: user\.id\.clone\(\),/);

  const register = bridge.slice(
    bridge.indexOf('fn auth_register('),
    bridge.indexOf('fn auth_login('),
  );
  assert.match(register, /ensure_official_membership\(state, &account, ctx\);/);

  const login = bridge.slice(
    bridge.indexOf('fn auth_login('),
    bridge.indexOf('fn auth_logout('),
  );
  assert.match(login, /ensure_official_membership\(state, &account, ctx\);/);

  const list = bridge.slice(
    bridge.indexOf('fn servers_list('),
    bridge.indexOf('fn servers_create('),
  );
  assert.match(list, /ensure_official_membership\(state, &user, ctx\);/);
});

test('konto dostaje stabilny identyfikator członka i adres serwera', () => {
  const helper = main.slice(
    main.indexOf('function ensureOfficialMembership'),
    main.indexOf('function serverMembersPayload'),
  );
  assert.match(helper, /const address = publicAddress \|\| `127\.0\.0\.1:\$\{CHAT_PORT\}`;/);
  assert.match(helper, /memberId: user\.id,/);
  assert.match(helper, /address,\r?\n\s+secure,\r?\n\s+invite: server\.invite,/);

  const rust = bridge.slice(
    bridge.indexOf('fn ensure_official_membership'),
    bridge.indexOf('fn servers_list('),
  );
  assert.match(rust, /origin_address\(&origin\)/);
  assert.match(rust, /format!\("127\.0\.0\.1:\{\}", state\.cfg\.port\)/);
  assert.match(rust, /member_id: user\.id\.clone\(\),/);
});

test('zaproszenie do serwera Chill jest zwykłym linkiem serwera', () => {
  assert.match(bridge, /format!\("\{\}\/\?invite=\{\}", origin, entry\.invite\)/);
  assert.match(main, /\?invite=\$\{encodeURIComponent\(entry\.invite\)\}/);
});

test('oficjalnego serwera Chill nie można opuścić ani usunąć', () => {
  const leave = main.slice(
    main.indexOf("registerIpcHandler('chill:servers-leave'"),
    main.indexOf("registerIpcHandler('chill:servers-invite'"),
  );
  assert.match(leave, /const official = officialHostedServer\(store\);/);
  assert.match(leave, /Oficjalny serwer Chill jest stały/);

  assert.match(bridge, /fn is_official_server\(state: &AppState, id: &str\) -> bool/);
  assert.match(bridge, /Oficjalny serwer Chill jest stały/);
});
