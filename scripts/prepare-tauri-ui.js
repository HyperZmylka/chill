'use strict';

// Kopiuje pliki interfejsu do zasobów powłoki Tauri.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'rust', 'chill-desktop', 'assets');
const files = [
  'index.html',
  'style.css',
  'minigames.css',
  'renderer.js',
  'minigames.js',
  'gifs.js',
  'stickers.js',
  'voice.js',
  'appearance.js',
  'chill-web.js',
  'tauri-desktop.js',
  'package.json',
  'build/icon.png',
];

fs.rmSync(target, { recursive: true, force: true });
for (const file of files) {
  const source = path.join(root, file);
  const destination = path.join(target, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}
console.log(`Tauri UI: ${files.length} plików w ${target}`);
