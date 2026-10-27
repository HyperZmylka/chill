'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const voice = require('../voice.js');

test('voice tokens round-trip with duration', () => {
  const id = '0123456789abcdef0123456789abcdef';
  assert.equal(voice.token(id, 7.4), `chill-voice://${id}?d=7.4`);
  assert.deepEqual(voice.parse(`  ${voice.token(id, 7.4)}  `), { id, seconds: 7.4 });
  assert.deepEqual(voice.parse(`chill-voice://${id}`), { id, seconds: 0 });
  assert.equal(voice.token('missing', 3), '');
  assert.equal(voice.token(id.toUpperCase(), 3), '');
});

test('voice token parsing rejects foreign and malformed messages', () => {
  const id = '0123456789abcdef0123456789abcdef';
  assert.equal(voice.parse('chill-voice://short'), null);
  assert.equal(voice.parse(`chill-voice://${id}?d=abc`), null);
  assert.equal(voice.parse(`chill-voice://${id}?d=1&x=2`), null);
  assert.equal(voice.parse(`https://example.com/${id}`), null);
  assert.equal(voice.parse(`chill-sticker://${id}`), null);
  assert.equal(voice.parse(''), null);
  assert.equal(voice.parse(null), null);
});

test('duration is clamped and formatted for the player', () => {
  assert.equal(voice.clampSeconds(0), 0);
  assert.equal(voice.clampSeconds(-4), 0);
  assert.equal(voice.clampSeconds(0.44), 0.4);
  assert.equal(voice.clampSeconds(12.34), 12.3);
  assert.equal(voice.clampSeconds(999), voice.MAX_SECONDS);
  assert.equal(voice.formatDuration(0), '0:00');
  assert.equal(voice.formatDuration(5.1), '0:06');
  assert.equal(voice.formatDuration(59.2), '1:00');
  assert.equal(voice.formatDuration(120), '2:00');
});

test('recorder MIME whitelist maps to safe extensions', () => {
  assert.equal(voice.normalizeMime('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(voice.normalizeMime('AUDIO/OGG'), 'audio/ogg');
  assert.equal(voice.normalizeMime('audio/mp4; codecs=mp4a.40.2'), 'audio/mp4');
  assert.equal(voice.normalizeMime('audio/x-wav'), 'audio/x-wav');
  assert.equal(voice.extensionForMime('audio/webm;codecs=opus'), 'webm');
  assert.equal(voice.extensionForMime('audio/ogg'), 'ogg');
  assert.equal(voice.extensionForMime('audio/mp4'), 'm4a');
  assert.equal(voice.extensionForMime('audio/wav'), 'wav');
  assert.equal(voice.extensionForMime('text/html'), '');
  assert.equal(voice.normalizeMime(''), '');
});

test('search text works in Polish and English, with and without diacritics', () => {
  const id = '0123456789abcdef0123456789abcdef';
  const text = voice.searchable(`chill-voice://${id}?d=3`);
  for (const term of ['głosówka', 'glosowka', 'wiadomość', 'wiadomosc', 'nagranie', 'audio', 'voice', 'message', 'recording']) {
    assert.ok(text.includes(term), `missing ${term}`);
  }
  assert.equal(voice.searchable('zwykła wiadomość'), '');
});

test('id validation only accepts server-generated hex ids', () => {
  assert.equal(voice.isValidId('0123456789abcdef0123456789abcdef'), true);
  assert.equal(voice.isValidId('0123456789ABCDEF0123456789ABCDEF'), false);
  assert.equal(voice.isValidId('../0123456789abcdef0123456789abcdef'), false);
  assert.equal(voice.isValidId(''), false);
});
