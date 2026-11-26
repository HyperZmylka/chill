'use strict';

// Buduje produkcyjny katalog statyczny: minifikuje JS/CSS, kopiuje HTML oraz
// ikony i dokłada pliki Brotli gotowe do serwowania bez pracy CPU na serwerze.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'dist-web');

const files = [
  'index.html',
  'terms.html',
  'privacy.html',
  'style.css',
  'minigames.css',
  'renderer.js',
  'minigames.js',
  'gifs.js',
  'stickers.js',
  'voice.js',
  'attachments.js',
  'appearance.js',
  'chill-web.js',
  'tauri-desktop.js',
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

function brotli(source) {
  return zlib.brotliCompressSync(source, {
    params: {
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: source.length,
    },
  });
}

function verifyReferences() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const missing = [];
  const pattern = /(?:src|href)="([^"#:]+)"/g;
  for (const match of html.matchAll(pattern)) {
    const reference = match[1];
    if (reference.startsWith('/') || !/\.[a-z0-9]+$/i.test(reference)) continue;
    if (!files.includes(reference)) missing.push(reference);
  }
  if (missing.length) {
    throw new Error(`Brak plików w dist-web: ${missing.join(', ')}`);
  }
}

verifyReferences();
fs.rmSync(target, { recursive: true, force: true });

let rawBytes = 0;
let minifiedBytes = 0;
let compressedBytes = 0;
for (const file of files) {
  const sourcePath = path.join(root, file);
  const destination = path.join(target, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const original = fs.readFileSync(sourcePath);
  const output = file.endsWith('.js') || file.endsWith('.css')
    ? Buffer.from(minify(file, original.toString('utf8')), 'utf8')
    : original;
  rawBytes += original.length;
  minifiedBytes += output.length;
  fs.writeFileSync(destination, output);

  if (/\.(?:html|css|js|svg)$/.test(file)) {
    const encoded = brotli(output);
    fs.writeFileSync(`${destination}.br`, encoded);
    compressedBytes += encoded.length;
  }
}

const kb = (bytes) => (bytes / 1024).toFixed(0);
console.log(
  `Web UI: ${files.length} plików, ${kb(rawBytes)} KB → ${kb(minifiedBytes)} KB ` +
    `(Brotli ${kb(compressedBytes)} KB) w ${target}`,
);
