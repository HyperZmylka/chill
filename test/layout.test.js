'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');

function blocks(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g');
  return [...css.matchAll(pattern)].map((match) => match[1]);
}

test('panel profilu jest dokowany do lewego dolnego rogu okna', () => {
  const [panel] = blocks('.me-panel');
  assert.ok(panel, 'brak reguły .me-panel');
  assert.match(panel, /position:\s*relative/);
  assert.match(panel, /margin:\s*auto -14px -14px calc\(-74px - 14px\)/);
  assert.match(panel, /background:\s*var\(--panel\)/);
  assert.doesNotMatch(panel, /margin-top:\s*auto;\s*border-top/);
});

test('profil i przyciski tworzą jeden poziomy pasek', () => {
  const [bar] = blocks('.me-bar');
  assert.ok(bar, 'brak reguły .me-bar');
  assert.match(bar, /display:\s*flex/);
  assert.match(bar, /flex-direction:\s*row/);

  const [card] = blocks('.me-card');
  assert.match(card, /flex:\s*1 1 auto/);
  assert.match(card, /width:\s*auto/);

  const [actions] = blocks('.me-actions');
  assert.match(actions, /justify-content:\s*flex-end/);
  assert.match(actions, /margin-left:\s*auto/);
});

test('pas serwerów rezerwuje miejsce na dokowany panel', () => {
  const [rail] = blocks('.server-rail');
  assert.ok(rail, 'brak reguły .server-rail');
  assert.match(rail, /padding:\s*14px 0 124px/);
});

test('wąski układ nadal dosuwa panel do krawędzi', () => {
  const compact = css.match(/margin-left:\s*calc\(-64px - 8px\)/g) || [];
  assert.ok(compact.length >= 2, `oczekiwano 2 reguł, jest ${compact.length}`);
  assert.match(css, /\.server-rail \{ padding: 10px 0 88px; gap: 8px; \}/);
});

test('przycisk Odebrane stoi obok mikrofonu i słuchawek', () => {
  const start = html.indexOf('<div class="me-actions">');
  const end = html.indexOf('<div class="audio-menu"', start);
  assert.ok(start >= 0 && end > start, 'brak paska akcji profilu');
  const actions = html.slice(start, end);
  assert.match(actions, /id="inboxBtn"/);
  assert.match(actions, /id="inboxCount"/);
  assert.ok(actions.indexOf('id="inboxBtn"') < actions.indexOf('id="settingsBtn"'));
  assert.match(actions, /aria-controls="inboxOverlay"/);
});

test('okno Odebrane ma zakładki, liczniki i oznaczanie jako przeczytane', () => {
  assert.match(html, /id="inboxOverlay"/);
  assert.match(html, /id="inboxTitle"/);
  for (const tab of ['foryou', 'mentions', 'unreads']) {
    assert.match(html, new RegExp(`data-inbox-tab="${tab}"`));
  }
  assert.match(html, /id="inboxMentionsCount"/);
  assert.match(html, /id="inboxUnreadsCount"/);
  assert.match(html, /id="inboxMarkAll"/);
  assert.match(html, /id="inboxBody"/);
});

test('licznik Odebrane jest czerwony i przycina wartości do 99+', () => {
  const [badge] = blocks('.inbox-count');
  assert.ok(badge, 'brak reguły .inbox-count');
  assert.match(badge, /position:\s*absolute/);
  assert.match(badge, /background:\s*#f23f42/);
  assert.match(badge, /color:\s*#fff/);
  assert.match(renderer, /function inboxCountLabel\(count\) \{[\s\S]*?'99\+'/);
  assert.match(renderer, /const mentionUnread = new Map\(\)/);
});

test('okno Odebrane jest wyśrodkowaną kartą z przewijaną listą', () => {
  const [card] = blocks('.modal-card.inbox-card');
  assert.ok(card, 'brak reguły .modal-card.inbox-card');
  assert.match(card, /display:\s*flex/);
  assert.match(card, /flex-direction:\s*column/);
  assert.match(card, /width:\s*min\(560px, 100%\)/);
  assert.match(card, /height:\s*min\(660px, 100%\)/);
  const [body] = blocks('.inbox-body');
  assert.match(body, /overflow-y:\s*auto/);
  assert.match(css, /\.modal \{[\s\S]*?place-items:\s*center/);
});
