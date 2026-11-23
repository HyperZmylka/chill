'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const attachments = require('../attachments.js');

const root = path.join(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const rustHttp = fs.readFileSync(path.join(root, 'rust', 'chill-server', 'src', 'http.rs'), 'utf8');

const MIB = 1024 * 1024;

test('limit załącznika to 64 MiB', () => {
  assert.equal(attachments.MAX_BYTES, 64 * MIB);
  assert.equal(attachments.formatSize(attachments.MAX_BYTES), '64 MB');
});

test('formatSize czytelnie pokazuje rozmiary plików', () => {
  assert.equal(attachments.formatSize(0), '0 B');
  assert.equal(attachments.formatSize(999), '999 B');
  assert.equal(attachments.formatSize(1536), '1.5 KB');
  assert.equal(attachments.formatSize(12 * MIB), '12 MB');
  assert.equal(attachments.formatSize(9.5 * MIB), '9.5 MB');
  assert.equal(attachments.formatSize(10.5 * MIB), '11 MB');
  assert.equal(attachments.formatSize(64 * MIB), '64 MB');
  assert.equal(attachments.formatSize(150 * MIB), '150 MB');
});

test('clampSize przyjmuje dokładny limit i przycina większe wartości', () => {
  assert.equal(attachments.clampSize(64 * MIB), 64 * MIB);
  assert.equal(attachments.clampSize(64 * MIB + 1), 64 * MIB);
  assert.equal(attachments.clampSize(12 * MIB), 12 * MIB);
  assert.equal(attachments.clampSize('2048'), 2048);
  assert.equal(attachments.clampSize(0), 0);
  assert.equal(attachments.clampSize(-5), 0);
  assert.equal(attachments.clampSize('nope'), 0);
  assert.equal(attachments.clampSize(Number.POSITIVE_INFINITY), 0);
});

test('token pliku przechodzi round-trip z rozmiarem i podpisem', () => {
  const id = '0123456789abcdef0123456789abcdef';
  const token = attachments.token(id, 'raport końcowy.pdf', 'application/pdf', 2048);
  assert.match(token, /^chill-file:\/\/[a-f0-9]{32}\?/);
  const parsed = attachments.parse(`${token}\nOpis pliku`);
  assert.deepEqual(parsed, {
    id,
    name: 'raport końcowy.pdf',
    mime: 'application/pdf',
    size: 2048,
    caption: 'Opis pliku',
  });
  assert.equal(attachments.token('missing', 'x', 'text/plain', 1), '');
});

test('token przycina rozmiar powyżej limitu i normalizuje metadane', () => {
  const id = 'fedcba9876543210fedcba9876543210';
  const token = attachments.token(id, '../zły\\plik?.txt', 'TEXT/PLAIN; charset=utf-8', 999 * MIB);
  const parsed = attachments.parse(token);
  assert.equal(parsed.name, '..złyplik.txt');
  assert.equal(parsed.mime, 'text/plain');
  assert.equal(parsed.size, attachments.MAX_BYTES);
});

test('renderer wysyła plik przez XHR z postępem i możliwością anulowania', () => {
  assert.match(renderer, /new XMLHttpRequest\(\)/);
  assert.match(renderer, /xhr\.upload\.addEventListener\('progress'/);
  assert.match(renderer, /function cancelAttachmentUpload\(/);
  assert.match(renderer, /function attachmentTooLargeMessage\(/);
  assert.match(renderer, /setAttachmentProgress\(/);
  assert.match(renderer, /Anuluj wysyłanie/);
  assert.doesNotMatch(renderer, /12 MB/);
  // Wolne, ale postępujące wysyłanie nie może kończyć się sztywnym limitem czasu.
  assert.match(renderer, /xhr\.timeout = 0/);
  assert.match(renderer, /90 \* 1000/);
  assert.match(renderer, /clearInterval\(watchdog\)/);
  assert.doesNotMatch(renderer, /15 \* 60 \* 1000/);
});

test('interfejs ma pasek postępu i styl stanu wysyłania', () => {
  assert.match(html, /id="composerAttachmentProgress"/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /id="composerAttachmentProgressBar"/);
  assert.match(css, /\.composer-attachment-progress\b/);
  assert.match(css, /\.composer-attachment\.uploading\b/);
});

test('serwery Node i Rust używają tego samego limitu i strumieniowania', () => {
  assert.match(rustHttp, /const MAX_ATTACHMENT_BODY: usize = 64 \* 1024 \* 1024;/);
  assert.match(rustHttp, /write_upload_body\(body, MAX_ATTACHMENT_BODY, &temp\)/);
  assert.match(rustHttp, /Body::from_stream\(ReaderStream::new\(/);
  assert.match(main, /const declared = Number\(req\.headers\['content-length'\]\);/);
  assert.match(main, /declared > attachmentMessages\.MAX_BYTES/);
  assert.match(main, /writeBodyToFile\(req, attachmentMessages\.MAX_BYTES, temp\)/);
  assert.doesNotMatch(main, /readVoiceBody\(req, attachmentMessages\.MAX_BYTES\)/);
});
