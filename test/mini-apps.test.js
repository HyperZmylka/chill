'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const renderer = read('renderer.js');
const index = read('index.html');
const css = read(path.join('minigames.css'));
const bridge = read('tauri-desktop.js');
const commands = read(path.join('rust', 'chill-desktop', 'src', 'commands.rs'));
const mainRs = read(path.join('rust', 'chill-desktop', 'src', 'main.rs'));
const cargo = read(path.join('rust', 'chill-desktop', 'Cargo.toml'));
const capabilities = read(path.join('rust', 'chill-desktop', 'capabilities', 'default.json'));

test('zakładka Mini zawiera wybór gier i aplikacji', () => {
  assert.match(index, /id="miniGamesBtn" title="Mini" data-i18n-title="Mini"/);
  assert.match(index, /class="nav-label" data-i18n="Mini">Mini<\/span>/);
  assert.doesNotMatch(index, /class="nav-label" data-i18n="Mini Gierki"/);
  assert.match(renderer, /data-mini-tab="games"[^>]*>[\s\S]*?Mini Gierki/);
  assert.match(renderer, /data-mini-tab="apps"[^>]*>[\s\S]*?Aplikacje/);
  assert.match(renderer, /let miniHubTab = 'games';/);
});

test('katalog aplikacji ma TikTok i pozostałe serwisy', () => {
  for (const [id, url] of [
    ['tiktok', 'https://www.tiktok.com/'],
    ['youtube', 'https://www.youtube.com/'],
    ['twitch', 'https://www.twitch.tv/'],
    ['instagram', 'https://www.instagram.com/'],
    ['spotify', 'https://open.spotify.com/'],
  ]) {
    assert.match(renderer, new RegExp(`id: '${id}'[\\s\\S]{0,160}url: '${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`), id);
  }
  assert.match(renderer, /dataset\.appId = app\.id/);
  assert.match(renderer, /Zaloguj się na swoje konto/);
});

test('aplikacje otwierają się w widoku osadzonym w głównym oknie', () => {
  assert.match(bridge, /app\.app\.openApp = \(id, bounds\) => call\('chill_open_app', \{ id: String\(id\), bounds \}\);/);
  assert.match(bridge, /app\.app\.closeApp =/);
  assert.match(bridge, /app\.app\.setAppBounds =/);
  assert.match(bridge, /app\.app\.appStatus =/);
  assert.match(bridge, /app\.app\.onAppClosed =/);
  assert.match(renderer, /typeof CHILL\.app\?\.openApp === 'function'/);
  assert.match(renderer, /function openMiniAppEmbedded\(app\)/);
  assert.match(renderer, /window\.innerHeight - y/);
  assert.match(renderer, /CHILL\.app\.setAppBounds\(miniAppView\.id, bounds\)/);
  assert.match(renderer, /CHILL\.app\?\.closeApp\?\.\(view\.id\)/);
  assert.match(renderer, /body\.classList\.add\('mini-app-open'\)/);
  assert.match(renderer, /function resetMiniAppView\(\)/);
  assert.match(renderer, /function syncMiniAppState\(\)/);
  assert.match(renderer, /CHILL\.app\.onAppClosed\(\(\) => resetMiniAppView\(\)\)/);
  assert.match(renderer, /openMiniAppExternal\(app\)/);
  assert.match(renderer, /window\.open\(app\.url, '_blank', 'noopener'\)/);
  assert.match(css, /\.mini-apps-grid \{/);
  assert.match(css, /\.mini-app-card \{/);
  assert.match(css, /\.mini-app-icon-tiktok \{/);
  assert.match(css, /body\.mini-app-open \.chat-body \{ visibility: hidden; \}/);
});

test('powłoka osadza tylko znane aplikacje i zamyka widok przy powrocie', () => {
  assert.match(commands, /fn mini_app_target\(id: &str\)/);
  assert.match(commands, /"tiktok" => Some\(\("TikTok", "https:\/\/www\.tiktok\.com\/"\)\)/);
  assert.match(commands, /"youtube" => Some\(\("YouTube", "https:\/\/www\.youtube\.com\/"\)\)/);
  assert.match(commands, /pub async fn chill_open_app\(/);
  assert.match(commands, /\.add_child\(/);
  assert.match(commands, /WebviewBuilder::new\(label, WebviewUrl::External\(parsed\)\)/);
  assert.match(commands, /pub fn chill_close_app/);
  assert.match(commands, /pub fn chill_set_app_bounds/);
  assert.match(commands, /pub fn chill_app_status/);
  assert.match(commands, /pub fn close_all_mini_apps/);
  assert.match(commands, /unknown_mini_app_is_rejected/);
  assert.match(commands, /embedded_app_bounds_stay_positive/);
  assert.match(mainRs, /commands::chill_open_app,/);
  assert.match(mainRs, /commands::chill_close_app,/);
  assert.match(mainRs, /commands::chill_set_app_bounds,/);
  assert.match(mainRs, /close_all_mini_apps\(window\.app_handle\(\)\)/);
  assert.match(mainRs, /chill:\/\/app-closed/);
  assert.match(capabilities, /"allow-chill-open-app"/);
  assert.match(capabilities, /"allow-chill-close-app"/);
  assert.match(capabilities, /"allow-chill-set-app-bounds"/);
  assert.match(capabilities, /"allow-chill-app-status"/);
  assert.match(cargo, /features = \["tray-icon", "unstable"\]/);
});

test('Mini ma polskie i angielskie teksty interfejsu', () => {
  assert.match(renderer, /'Mini': 'Mini'/);
  assert.match(renderer, /'Gry i aplikacje w Chillu': 'Games and apps in Chill'/);
  assert.match(renderer, /'Otwórz w Chill': 'Open in Chill'/);
  assert.match(renderer, /'W przeglądarce': 'In browser'/);
  assert.match(renderer, /'Zaloguj się na swoje konto': 'Sign in to your account'/);
  assert.match(renderer, /'W oknie Chill': 'In the Chill window'/);
  assert.match(renderer, /'Aplikacja w Chillu — wróć do Mini': 'App in Chill — back to Mini'/);
  assert.match(renderer, /'Wróć do Mini': 'Back to Mini'/);
  assert.match(renderer, /'Aplikacje otwierają się w tym samym oknie Chill/);
  assert.match(renderer, /'Aplikacje otwierają się w nowej karcie/);
});
