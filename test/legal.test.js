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
const terms = read('terms.html');
const privacy = read('privacy.html');
const httpRs = read(path.join('rust', 'chill-server', 'src', 'http.rs'));
const prepare = read(path.join('scripts', 'prepare-tauri-ui.js'));

test('karta dokumentów ma tytuł, opis i trzy przyciski', () => {
  assert.match(index, /id="legalNotice"/);
  assert.match(index, /data-legal-version="2026-11-18"/);
  assert.match(index, /id="legalTitle"[\s\S]*?data-i18n="Zaktualizowaliśmy Regulamin i Politykę prywatności"/);
  assert.match(index, /id="legalReadTerms"[\s\S]*?data-i18n="Przeczytaj regulamin"/);
  assert.match(index, /id="legalPrivacy"[\s\S]*?data-i18n="Prywatność"/);
  assert.match(index, /id="legalGotIt"[\s\S]*?data-i18n="Rozumiem"/);
});

test('karta jest w prawym dolnym rogu i nie zasłania kompozytora', () => {
  assert.match(css, /\.legal-card \{[^}]*position: fixed; right: 22px; bottom: 22px;/);
  assert.match(css, /body:has\(#composer:not\(\[hidden\]\)\) \.legal-card \{ bottom: 92px; \}/);
  assert.match(css, /\.legal-card\.show \{ opacity: 1; transform: translateY\(0\); \}/);
});

test('karta pojawia się po logowaniu i zapamiętuje wersję po Got it', () => {
  assert.match(renderer, /const LEGAL_VERSION = '2026-11-18';/);
  assert.match(renderer, /legalVersion: '',/);
  assert.match(renderer, /setTimeout\(showLegalNoticeIfNeeded, 700\);/);
  assert.match(renderer, /String\(prefs\.legalVersion \|\| ''\) === LEGAL_VERSION/);
  assert.match(renderer, /prefs\.legalVersion = LEGAL_VERSION;\s*\n\s*savePrefs\(\);/);
  assert.match(renderer, /function openLegalDocument\(/);
  assert.match(renderer, /return `\$\{LEGAL_SITE\}\/\$\{doc\}\.html\?lang=\$\{lang\}&v=\$\{LEGAL_VERSION\}`;/);
  assert.match(renderer, /openLegalDocument\('terms'\)/);
  assert.match(renderer, /openLegalDocument\('privacy'\)/);
});

test('Ustawienia mają stałe wejście do obu dokumentów', () => {
  assert.match(index, /id="openTermsBtn"/);
  assert.match(index, /id="openPrivacyBtn"/);
  assert.match(index, /data-i18n="Dokumenty"/);
  assert.match(css, /\.legal-block \{[^}]*display: flex;/);
  assert.match(css, /\.legal-links \{ display: flex;/);
});

test('dokumenty są dwujęzyczne i mają wersję oraz datę', () => {
  for (const [name, source, plTitle, enTitle] of [
    ['terms.html', terms, 'Regulamin Chill', 'Chill Terms of Service'],
    ['privacy.html', privacy, 'Polityka prywatności Chill', 'Chill Privacy Policy'],
  ]) {
    assert.match(source, /data-doc-lang="pl"/, name);
    assert.match(source, /data-doc-lang="en"/, name);
    assert.match(source, /Wersja 2026-11-18 · Ostatnia aktualizacja: 18 listopada 2026/, name);
    assert.match(source, /Version 2026-11-18 · Last updated: November 18, 2026/, name);
    assert.match(source, new RegExp(plTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), name);
    assert.match(source, new RegExp(enTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), name);
    assert.match(source, /data-set-lang="pl"/, name);
    assert.match(source, /data-set-lang="en"/, name);
    assert.match(source, /URLSearchParams\(location\.search\)/, name);
  }
  assert.match(terms, /href="\/privacy\.html"/);
  assert.match(privacy, /href="\/terms\.html"/);
});

test('serwer i zasoby Tauri serwują oba dokumenty', () => {
  assert.match(httpRs, /"terms\.html" => \("terms\.html", "text\/html; charset=utf-8"\)/);
  assert.match(httpRs, /"privacy\.html" => \("privacy\.html", "text\/html; charset=utf-8"\)/);
  assert.match(prepare, /'terms\.html',/);
  assert.match(prepare, /'privacy\.html',/);
});
