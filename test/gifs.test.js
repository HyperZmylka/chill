'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'gifs.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox, { filename: 'gifs.js' });
const gifs = sandbox.window.CHILL_GIFS;

const GIPHY_ID_RE = /^[A-Za-z0-9]{5,40}$/;
const KLIPY_MEDIA_RE = /^https:\/\/static2?\.klipy\.com\/ii\/[a-f0-9]{32}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[A-Za-z0-9]+\.(?:webp|gif)$/;
const TENOR_MEDIA_RE = /^https:\/\/media1?\.tenor\.com\/(?:m\/)?[A-Za-z0-9_%-]{6,40}\/[A-Za-z0-9._~%-]+\.(?:webp|gif)$/;
const TENOR_PAGE_RE = /^https:\/\/tenor\.com\/view\/[A-Za-z0-9_%~-]{2,200}$/;

test('GIF catalog is non-empty and every entry has a unique id', () => {
  assert.ok(Array.isArray(gifs));
  assert.ok(gifs.length >= 150, `expected at least 150 GIFs, got ${gifs.length}`);
  assert.equal(new Set(gifs.map((gif) => gif.id)).size, gifs.length);
});

test('every GIF entry has a supported source and safe HTTPS media', () => {
  for (const gif of gifs) {
    assert.equal(typeof gif.id, 'string');
    assert.ok(gif.id.length > 0);
    assert.ok(typeof gif.title === 'string' && gif.title.length > 0, gif.id);
    assert.ok(typeof gif.category === 'string' && gif.category.length > 0, gif.id);
    assert.ok(typeof gif.tags === 'string' && gif.tags.length > 0, gif.id);
    if (gif.source === 'klipy') {
      assert.match(gif.webp, KLIPY_MEDIA_RE, gif.id);
      assert.match(gif.gif, KLIPY_MEDIA_RE, gif.id);
      assert.ok(gif.w > 0 && gif.h > 0, gif.id);
    } else if (gif.source === 'tenor') {
      assert.match(gif.webp, TENOR_MEDIA_RE, gif.id);
      assert.match(gif.gif, TENOR_MEDIA_RE, gif.id);
      assert.match(gif.page, TENOR_PAGE_RE, gif.id);
      assert.ok(gif.w > 0 && gif.h > 0, gif.id);
    } else {
      assert.equal(gif.source, undefined, gif.id);
      assert.match(gif.id, GIPHY_ID_RE, gif.id);
    }
  }
});

test('Tenor GIFs cover every category and use media.tenor.com', () => {
  const tenor = gifs.filter((gif) => gif.source === 'tenor');
  assert.ok(tenor.length >= 70, `expected at least 70 Tenor GIFs, got ${tenor.length}`);
  const categories = new Set(tenor.map((gif) => gif.category));
  for (const category of ['Popularne', 'Reakcje', 'Śmieszne', 'Zwierzęta', 'Jedzenie', 'Gry', 'Tenor']) {
    assert.ok(categories.has(category), `missing Tenor category ${category}`);
  }
  assert.equal(new Set(tenor.map((gif) => gif.gif)).size, tenor.length, 'duplicate Tenor media URL');
  for (const gif of tenor) {
    assert.match(gif.webp, /^https:\/\/media\.tenor\.com\//);
    assert.match(gif.gif, /^https:\/\/media1\.tenor\.com\/m\//);
  }
});

test('Tenor entries include Polish search terms', () => {
  const tenor = gifs.filter((gif) => gif.source === 'tenor');
  const text = tenor.map((gif) => gif.tags).join(' ');
  for (const term of ['popularne', 'reakcje', 'śmieszne', 'zwierzęta', 'jedzenie', 'gry', 'tenor']) {
    assert.ok(text.includes(term), `missing search term ${term}`);
  }
  assert.ok(tenor.some((gif) => gif.tags.includes('kot')), 'missing Polish cat tag');
  assert.ok(tenor.some((gif) => gif.tags.includes('pies')), 'missing Polish dog tag');
  assert.ok(tenor.some((gif) => gif.tags.includes('pizza')), 'missing pizza tag');
});
