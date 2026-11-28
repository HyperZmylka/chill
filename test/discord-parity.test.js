'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const renderer = read('renderer.js');
const index = read('index.html');
const css = read('style.css');
const model = read(path.join('rust', 'chill-server', 'src', 'model.rs'));
const ws = read(path.join('rust', 'chill-server', 'src', 'ws.rs'));
const state = read(path.join('rust', 'chill-server', 'src', 'state.rs'));
const workflow = read(path.join('.github', 'workflows', 'release-build.yml'));

test('model przechowuje przypięcia, ankiety i kategorie', () => {
  assert.match(model, /pub pinned_at: Option<u64>,/);
  assert.match(model, /pub poll: Option<Poll>,/);
  assert.match(model, /pub struct PollOption \{/);
  assert.match(model, /pub struct Poll \{/);
  assert.match(model, /pub votes: BTreeMap<String, Vec<String>>,/);
  assert.match(model, /pub struct ChannelCategory \{/);
  assert.match(model, /pub categories: Vec<ChannelCategory>,/);
  assert.match(model, /pub category_id: String,/);
  assert.match(model, /#\[serde\(default, rename_all = "camelCase"\)\]/);
});

test('serwer obsługuje przypinanie z limitem 100 i zachowuje pinezki przy przycinaniu', () => {
  assert.match(ws, /"server:pin" => handle_server_pin/);
  assert.match(ws, /fn handle_server_pin\(/);
  assert.match(ws, /count >= 100/);
  assert.match(ws, /fn trim_messages\(list: &mut Vec<Message>, limit: usize\)/);
  assert.match(ws, /position\(\|message\| message\.pinned_at\.is_none\(\)\)/);
  assert.match(ws, /pinned_messages_payload\(&server\)/);
  assert.match(ws, /"pins": pins/);
  assert.match(ws, /recent\.sort_by_key/);
  assert.match(state, /filter\(\|message\| message\.pinned_at\.is_some\(\)\)/);
  assert.match(renderer, /function trimHistory\(list, limit = 300\)/);
});

test('serwer obsługuje ankiety, głosowanie i zamykanie', () => {
  for (const type of ['server:poll', 'server:poll:vote', 'server:poll:close']) {
    assert.match(ws, new RegExp(`"${type}" => handle_`), type);
  }
  assert.match(ws, /fn handle_server_poll\(/);
  assert.match(ws, /fn handle_server_poll_vote\(/);
  assert.match(ws, /fn handle_server_poll_close\(/);
  assert.match(ws, /fn toggle_poll_vote\(/);
  assert.match(ws, /fn poll_is_closed\(/);
  assert.match(ws, /options\.len\(\) < 2/);
  assert.match(ws, /options\.len\(\) >= 10/);
  assert.match(ws, /"server:poll:update"/);
  assert.match(ws, /duration_minutes\.clamp\(60, 10_080\)/);
  assert.match(ws, /poll\.closes_at = None;/);
  assert.match(renderer, /if \(message\?\.poll\) return false;/);
});

test('serwer obsługuje kategorie i przypisanie kanałów', () => {
  for (const type of [
    'server:channel:category',
    'server:category:create',
    'server:category:rename',
    'server:category:delete',
  ]) {
    assert.match(ws, new RegExp(`"${type}" => handle_`), type);
  }
  assert.match(ws, /fn handle_channel_category\(/);
  assert.match(ws, /fn handle_category_create\(/);
  assert.match(ws, /fn handle_category_rename\(/);
  assert.match(ws, /fn handle_category_delete\(/);
  assert.match(ws, /fn categories_payload\(/);
  assert.match(ws, /"categories": categories/);
  assert.match(state, /server\.categories\.retain/);
  assert.match(state, /channel\.category_id\.clear\(\)/);
});

test('interfejs pokazuje pinezki, ankiety i kategorie', () => {
  assert.match(renderer, /case 'server:pin':/);
  assert.match(renderer, /case 'server:poll:update':/);
  assert.match(renderer, /case 'server:categories':/);
  assert.match(renderer, /function buildPollBlock\(message\)/);
  assert.match(renderer, /function voteInPoll\(message, optionId\)/);
  assert.match(renderer, /function closePoll\(message\)/);
  assert.match(renderer, /function toggleMessagePin\(message\)/);
  assert.match(renderer, /function openPinsPanel\(\)/);
  assert.match(renderer, /function renderPinsPanel\(\)/);
  assert.match(renderer, /function openPollModal\(\)/);
  assert.match(renderer, /function createPollFromModal\(\)/);
  assert.match(renderer, /function openCategoryManager\(/);
  assert.match(renderer, /function buildCategoryHeader\(/);
  assert.match(renderer, /function toggleCategoryCollapsed\(/);
  assert.match(renderer, /server:poll:vote/);
  assert.match(renderer, /server:pin/);
  assert.match(renderer, /type: 'server:channel:category'/);
  assert.match(renderer, /'Zarządzaj kategoriami': 'Manage categories'/);
});

test('HTML i CSS zawierają okna oraz style nowych funkcji', () => {
  for (const id of ['pinsOverlay', 'pollOverlay', 'categoryOverlay', 'newChannelCategory']) {
    assert.match(index, new RegExp(`id="${id}"`), id);
  }
  assert.match(index, /id="pinsBtn"/);
  assert.match(index, /id="pollBtn"/);
  assert.match(index, /id="addCategoryBtn"/);
  assert.match(css, /\.channel-category \{/);
  assert.match(css, /\.poll-option \{/);
  assert.match(css, /\.pins-card \{/);
  assert.match(css, /\.category-manager-row \{/);
});

test('nowy test jest uruchamiany w wydaniu', () => {
  assert.match(workflow, /test\/discord-parity\.test\.js/);
});
