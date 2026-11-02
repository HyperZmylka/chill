'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { __test: game, createGameDetector } = require('../game-detect.js');

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('known games are matched by process name and platform', () => {
  assert.equal(game.matchKnownProcess({ name: 'RobloxPlayerBeta.exe' }).name, 'Roblox');
  assert.equal(game.matchKnownProcess({ name: 'RobloxPlayerBeta' }).platform, 'roblox');
  assert.equal(game.matchKnownProcess({ name: 'cs2.exe' }).name, 'Counter-Strike 2');
  assert.equal(game.matchKnownProcess({ name: 'FortniteClient-Win64-Shipping.exe' }).name, 'Fortnite');
  assert.equal(game.matchKnownProcess({ name: 'SeaOfThieves.exe' }).name, 'Sea of Thieves');
});

test('Minecraft requires a Minecraft Java process path', () => {
  assert.equal(game.matchKnownProcess({ name: 'javaw.exe', path: 'C:\\Windows\\javaw.exe' }), null);
  assert.equal(game.matchKnownProcess({ name: 'javaw.exe', path: 'C:\\Users\\x\\.minecraft\\javaw.exe' }).name, 'Minecraft');
});

test('helper and launcher processes are excluded', () => {
  assert.equal(game.isHelperName('steamwebhelper'), true);
  assert.equal(game.isHelperName('GameLauncher'), true);
  assert.equal(game.isHelperName('MyGameUpdater'), true);
  assert.equal(game.isHelperName('RobloxPlayerBeta'), false);
});

test('noise detection does not reject games with common words', () => {
  assert.equal(game.isKnownNoiseName('Observer'), false);
  assert.equal(game.isKnownNoiseName('SteamWorld Dig'), false);
  assert.equal(game.isKnownNoiseName('Code Vein'), false);
  assert.equal(game.isKnownNoiseName('Steam'), true);
  assert.equal(game.isKnownNoiseName('Microsoft Edge'), true);
});

test('game names are cleaned for display', () => {
  assert.equal(game.cleanGameName('Cyberpunk 2077\u2122'), 'Cyberpunk 2077');
  assert.equal(game.cleanGameName('Roblox with Medal'), 'Roblox');
  assert.equal(game.cleanGameName('  Some   Game  '), 'Some Game');
});

test('process names are prettified for heuristic games', () => {
  assert.equal(game.prettifyProcessName('MyGame-Win64-Shipping'), 'My Game');
  assert.equal(game.prettifyProcessName('cool_game_x64'), 'Cool Game');
});

test('platform detection follows install paths', () => {
  assert.equal(game.platformFromPath('D:\\SteamLibrary\\steamapps\\common\\X\\x.exe'), 'steam');
  assert.equal(game.platformFromPath('C:\\Program Files\\Epic Games\\X\\x.exe'), 'epic');
  assert.equal(game.platformFromPath('C:\\Users\\x\\AppData\\Local\\Roblox\\Versions\\v\\RobloxPlayerBeta.exe'), 'roblox');
  assert.equal(game.platformFromPath('C:\\XboxGames\\X\\x.exe'), 'xbox');
});

test('Steam library manifests are parsed', () => {
  const vdf = '"libraryfolders" { "0" { "path" "C:\\\\Program Files (x86)\\\\Steam" } "1" { "path" "D:\\\\Games\\\\Steam" } }';
  assert.deepEqual(game.parseSteamLibraryFolders(vdf), ['C:\\Program Files (x86)\\Steam', 'D:\\Games\\Steam']);
  const acf = '"AppState" { "appid" "123" "name" "Test Game" "installdir" "TestGame" }';
  assert.deepEqual(game.parseAcf(acf), { appid: '123', name: 'Test Game', installdir: 'TestGame' });
});

test('uninstall registry entries and display icons are parsed', () => {
  const reg = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\X\\{1}\r\n    DisplayName    REG_SZ    Roblox\r\n    Publisher    REG_SZ    Roblox Corporation\r\n    InstallLocation    REG_SZ    C:\\Games\\Roblox\r\n';
  const entry = game.parseRegEntries(reg)[0];
  assert.equal(entry.displayname, 'Roblox');
  assert.equal(entry.publisher, 'Roblox Corporation');
  assert.equal(entry.installlocation, 'C:\\Games\\Roblox');
  assert.equal(game.displayIconPath('"C:\\Games\\X\\x.exe",0'), 'C:\\Games\\X\\x.exe');
  assert.equal(game.displayIconPath('C:\\Games\\X\\x.exe,0'), 'C:\\Games\\X\\x.exe');
});

test('icon sanitizer accepts only PNG data URLs within the limit', () => {
  assert.equal(game.sanitizeIcon(PNG_1PX), PNG_1PX);
  assert.equal(game.sanitizeIcon('https://example.com/icon.png'), '');
  assert.equal(game.sanitizeIcon('data:image/gif;base64,AAAA'), '');
  assert.equal(game.sanitizeIcon(`data:image/png;base64,${'A'.repeat(130_000)}`), '');
});

test('heuristic scoring recognizes game binaries outside known libraries', () => {
  const proc = {
    name: 'IndieGame-Win64-Shipping.exe',
    path: 'D:\\Stuff\\IndieGame\\Binaries\\Win64\\IndieGame-Win64-Shipping.exe',
    title: 'IndieGame',
    company: '',
    description: '',
  };
  assert.ok(game.scoreHeuristic(proc, 'indiegame-win64-shipping') >= 3);
  assert.equal(game.pickHeuristicName({ title: 'Cool Indie Game', product: 'Cool Indie Game', description: '' }, 'coolgame'), 'Cool Indie Game');
  assert.equal(game.pickHeuristicName({ title: 'Untitled', product: '', description: '' }, 'mygame'), 'Mygame');
});

test('detector returns the best candidate with its icon', async () => {
  const seen = [];
  const detector = createGameDetector({
    processProvider: async () => ([
      {
        name: 'RobloxPlayerBeta',
        path: 'C:\\Users\\x\\AppData\\Local\\Roblox\\Versions\\v\\RobloxPlayerBeta.exe',
        title: 'Roblox',
        company: 'Roblox Corporation',
        description: 'Roblox Player',
        product: 'Roblox',
        start: Date.now(),
        handle: 1,
      },
      {
        name: 'chrome',
        path: 'C:\\Program Files\\Google\\Chrome\\chrome.exe',
        title: 'YouTube',
        company: 'Google',
        description: 'Chrome',
        product: 'Chrome',
        start: Date.now(),
        handle: 2,
      },
    ]),
    readIcon: async (exe) => {
      seen.push(exe);
      return PNG_1PX;
    },
  });
  const result = await detector.detect();
  assert.equal(result.name, 'Roblox');
  assert.equal(result.platform, 'roblox');
  assert.equal(result.icon, PNG_1PX);
  assert.equal(seen.length, 1);
  detector.dispose();
});

test('detector returns null when nothing game-like is running', async () => {
  const detector = createGameDetector({ processProvider: async () => [], readIcon: async () => '' });
  assert.equal(await detector.detect(), null);
  detector.dispose();
});

test('detector keeps the game when the executable has no icon', async () => {
  const detector = createGameDetector({
    processProvider: async () => ([{
      name: 'RobloxPlayerBeta.exe',
      path: 'C:\\x\\RobloxPlayerBeta.exe',
      title: 'Roblox',
      start: 1,
      handle: 1,
    }]),
    readIcon: async () => '',
  });
  const result = await detector.detect();
  assert.equal(result.name, 'Roblox');
  assert.equal(result.icon, '');
  detector.dispose();
});
