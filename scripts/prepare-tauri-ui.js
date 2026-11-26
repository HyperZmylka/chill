'use strict';

// Przygotowuje okrojone i zminifikowane pliki interfejsu dla powłoki Tauri.
// Źródła w katalogu głównym pozostają czytelne dla testów i wersji webowej.
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'rust', 'chill-desktop', 'assets');
const files = [
  'index.html',
  'terms.html',
  'privacy.html',
  'style.css',
  'minigames.css',
  'renderer.js',
  'minigames.js',
  'gifs.js',
  'attachments.js',
  'stickers.js',
  'voice.js',
  'appearance.js',
  'chill-web.js',
  'tauri-desktop.js',
  'package.json',
  'build/icon.png',
  'build/icon.svg',
];

function minify(file, source) {
  if (file.endsWith('.js')) {
    return esbuild.transformSync(source, {
      loader: 'js',
      minifyWhitespace: true,
      minifySyntax: true,
      minifyIdentifiers: false,
      legalComments: 'none',
      charset: 'utf8',
    }).code;
  }
  if (file.endsWith('.css')) {
    return esbuild.transformSync(source, {
      loader: 'css',
      minify: true,
      legalComments: 'none',
      charset: 'utf8',
    }).code;
  }
  return source;
}

fs.rmSync(target, { recursive: true, force: true });
let saved = 0;
for (const file of files) {
  const sourcePath = path.join(root, file);
  const destination = path.join(target, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (file.endsWith('.js') || file.endsWith('.css')) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    const output = minify(file, source);
    saved += Buffer.byteLength(source) - Buffer.byteLength(output);
    fs.writeFileSync(destination, output);
  } else {
    fs.copyFileSync(sourcePath, destination);
  }
}
console.log(`Tauri UI: ${files.length} plików w ${target} (mniej o ${(saved / 1024).toFixed(0)} KB)`);
