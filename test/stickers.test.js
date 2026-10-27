'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const pack = require('../stickers.js');

test('pack contains 24 unique stickers in the expected categories', () => {
  assert.equal(pack.stickers.length, 24);
  assert.equal(new Set(pack.stickers.map((sticker) => sticker.id)).size, 24);
  assert.deepEqual(pack.categories, ['Reakcje', 'Emocje', 'Zwierzęta', 'Jedzenie', 'Impreza']);
  for (const sticker of pack.stickers) {
    assert.match(sticker.id, /^[a-z0-9-]{2,40}$/);
    assert.ok(sticker.labelPl.length > 0);
    assert.ok(sticker.labelEn.length > 0);
    assert.ok(sticker.tags.length > 0);
    assert.ok(pack.categories.includes(sticker.category));
  }
});

test('all stickers are self-contained SVGs', () => {
  for (const sticker of pack.stickers) {
    assert.match(sticker.svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 240 240"/);
    assert.match(sticker.svg, /<\/svg>$/);
    assert.doesNotMatch(sticker.svg, /<script/i);
    assert.doesNotMatch(sticker.svg, /\son[a-z]+=/i);
    assert.doesNotMatch(sticker.svg, /(?:src|href)=["']https?:/i);
  }
});

test('every SVG tag has unique attributes (valid XML for img src)', () => {
  for (const sticker of pack.stickers) {
    for (const tag of sticker.svg.match(/<[a-z][^>]*>/gi) || []) {
      const names = [...tag.matchAll(/\s([a-zA-Z][\w:-]*)\s*=/g)].map((match) => match[1].toLowerCase());
      assert.equal(new Set(names).size, names.length, `${sticker.id}: duplicate attribute in ${tag.slice(0, 80)}`);
    }
  }
});

test('sticker tokens round-trip and reject unknown values', () => {
  for (const sticker of pack.stickers) {
    assert.equal(pack.token(sticker.id), `chill-sticker://${sticker.id}`);
    assert.equal(pack.parse(pack.token(sticker.id)), sticker);
    assert.equal(pack.parse(`  ${pack.token(sticker.id)}  `), sticker);
  }
  assert.equal(pack.token('missing-sticker'), '');
  assert.equal(pack.parse('chill-sticker://missing-sticker'), null);
  assert.equal(pack.parse('https://media.giphy.com/media/abc123/giphy.gif'), null);
  assert.equal(pack.parse('chill-sticker://Hej'), null);
  assert.equal(pack.parse(''), null);
  assert.equal(pack.parse(null), null);
});

test('data URLs are cached and safe for the img src CSP', () => {
  for (const sticker of pack.stickers) {
    const url = pack.dataUrl(sticker);
    assert.ok(url.startsWith('data:image/svg+xml;charset=utf-8,'));
    assert.equal(url, pack.dataUrl(sticker.id));
    assert.ok(decodeURIComponent(url.split(',', 2)[1]).startsWith('<svg xmlns="'));
    assert.doesNotMatch(url, /[\r\n]/);
  }
  assert.equal(pack.dataUrl('missing-sticker'), '');
});

test('labels and bilingual search text work in both languages', () => {
  assert.equal(pack.label('kot', 'pl'), 'Kot');
  assert.equal(pack.label('kot', 'en'), 'Cat');
  assert.match(pack.searchText('kot'), /kot/);
  assert.match(pack.searchText('kot'), /cat/);
  assert.match(pack.searchText('dzieki'), /thanks/);
  assert.match(pack.searchText('zaba'), /żaba/);
  assert.match(pack.searchText('impreza'), /party/);
  assert.equal(pack.label('missing-sticker'), '');
  assert.equal(pack.searchText('missing-sticker'), '');
});
