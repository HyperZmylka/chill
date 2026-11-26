'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'renderer.js'), 'utf8');
const prepare = fs.readFileSync(path.join(root, 'scripts', 'prepare-tauri-ui.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'rust', 'chill-desktop', 'src', 'server.rs'), 'utf8');
const assets = fs.readFileSync(path.join(root, 'rust', 'chill-server', 'src', 'assets.rs'), 'utf8');

function bootMarkup() {
  const start = html.indexOf('<div class="boot"');
  const end = html.indexOf('<!-- ========== LOGOWANIE', start);
  assert.ok(start >= 0 && end > start, 'brak ekranu startowego');
  return html.slice(start, end);
}

test('ekran startowy pokazuje ikonę Chill i litery marki', () => {
  const block = bootMarkup();
  assert.match(block, /id="bootSplash"/);
  assert.match(block, /src="build\/icon\.svg"/);
  assert.equal((block.match(/class="boot-letter"/g) || []).length, 5);
  assert.match(block, /class="boot-dot"/);
  assert.match(block, /role="status"/);
});

test('litery pojawiają się kolejno obok ikony', () => {
  assert.match(css, /\.boot-letter\s*\{[^}]*animation:\s*bootLetterIn/);
  assert.match(css, /\.boot-letter\s*\{[^}]*animation-delay:\s*calc\(30ms \+ var\(--i\) \* 28ms\)/);
  for (const name of ['bootGlow', 'bootIconIn', 'bootHalo', 'bootLetterIn', 'bootDotIn', 'bootTrack', 'bootTrackIn']) {
    assert.match(css, new RegExp(`@keyframes ${name}`), `brak @keyframes ${name}`);
  }
  assert.match(html, /style="--i: 0"/);
  assert.match(html, /style="--i: 4"/);
});

test('ekran startowy znika płynnie po przygotowaniu aplikacji', () => {
  assert.match(renderer, /const BOOT_SPLASH_MIN_MS = 300/);
  assert.match(renderer, /function dismissBootSplash\(\)/);
  assert.match(renderer, /classList\.add\('boot-leaving'\)/);
  assert.match(renderer, /if \(user\) enterApp\(user\);\s*else showAuth\('login'\);\s*dismissBootSplash\(\);/);
  assert.doesNotMatch(renderer, /\$\('bootSplash'\)\.hidden = true/);
  assert.match(css, /\.boot-leaving\s*\{/);
});

test('animacja startowa respektuje ograniczenie ruchu', () => {
  const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.boot-letter \{[\s\S]*?bootLetterFade 180ms ease-out both !important;[\s\S]*?\.boot-track span \{ transform: scaleX\(1\); animation: bootTrackFade 300ms ease-out 40ms both !important; \}[\s\S]*?\}/);
  assert.ok(reduced, 'brak łagodnych animacji reduced-motion dla ekranu startowego');
  assert.match(css, /@keyframes bootLetterFade/);
  assert.match(css, /@keyframes bootDotFade/);
  assert.match(css, /@keyframes bootTrackFade/);
});

test('okno Tauri ma ciemne tło przed pierwszym malowaniem', () => {
  assert.match(server, /\.background_color\(Color\(5, 10, 8, 255\)\)/);
  assert.match(server, /\.visible\(false\)/);
});

test('zasoby Tauri zawierają ikonę SVG', () => {
  assert.match(prepare, /'build\/icon\.svg'/);
  assert.match(assets, /"build\/icon\.svg", "image\/svg\+xml"/);
});
