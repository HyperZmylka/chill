'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

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
