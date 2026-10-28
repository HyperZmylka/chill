'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const appearance = require('../appearance.js');

test('appearance normalizes unknown values to safe defaults', () => {
  const normalized = appearance.normalizeAppearance({
    theme: 'neon',
    accent: 'javascript:alert(1)',
    shape: 'triangle',
    background: 'space',
    messageStyle: 'cards',
    fontScale: 'huge',
    reduceMotion: 'yes',
    highContrast: 1,
  });
  assert.deepEqual(normalized, {
    theme: 'system',
    accent: '#3ee0a3',
    shape: 'soft',
    background: 'default',
    messageStyle: 'bubbles',
    fontScale: 'normal',
    reduceMotion: false,
    highContrast: false,
  });
});

test('appearance accepts every supported option', () => {
  const full = appearance.normalizeAppearance({
    theme: 'discord',
    accent: '#5865F2',
    shape: 'square',
    background: 'aurora',
    messageStyle: 'flat',
    fontScale: 'large',
    reduceMotion: true,
    highContrast: true,
  });
  assert.deepEqual(full, {
    theme: 'discord',
    accent: '#5865f2',
    shape: 'square',
    background: 'aurora',
    messageStyle: 'flat',
    fontScale: 'large',
    reduceMotion: true,
    highContrast: true,
  });
});

test('colors accept short hex and lower-case the result', () => {
  assert.equal(appearance.normalizeColor('#ABC'), '#aabbcc');
  assert.equal(appearance.normalizeColor('#FF7AA2'), '#ff7aa2');
  assert.equal(appearance.normalizeColor('  #123456  '), '#123456');
  assert.equal(appearance.normalizeColor('red'), '#3ee0a3');
  assert.equal(appearance.normalizeColor(''), '#3ee0a3');
  assert.equal(appearance.normalizeColor(null), '#3ee0a3');
});

test('accent ink keeps text readable on light and dark colors', () => {
  assert.equal(appearance.readableInk('#3ee0a3'), '#05271c');
  assert.equal(appearance.readableInk('#ffd166'), '#05271c');
  assert.equal(appearance.readableInk('#5865f2'), '#ffffff');
  assert.equal(appearance.readableInk('#101010'), '#ffffff');
  assert.ok(appearance.contrastRatio('#5865f2', '#ffffff') >= 4.5);
  assert.ok(appearance.contrastRatio('#3ee0a3', '#05271c') >= 4.5);
});

test('all presets are valid, immutable copies', () => {
  assert.equal(appearance.PRESET_IDS.length, 6);
  for (const id of appearance.PRESET_IDS) {
    const entry = appearance.preset(id);
    assert.ok(entry, `missing preset ${id}`);
    assert.deepEqual(appearance.normalizeAppearance(entry), entry);
    assert.equal(appearance.matchPreset(entry), id);
    entry.accent = '#000000';
    assert.notEqual(appearance.preset(id).accent, '#000000');
  }
  assert.equal(appearance.preset('missing'), null);
});

test('preset matching reports custom when any option differs', () => {
  const discord = appearance.preset('discord');
  assert.equal(appearance.matchPreset({ ...discord, shape: 'rounded' }), 'custom');
  assert.equal(appearance.matchPreset({ ...discord, accent: '#ff7aa2' }), 'custom');
  assert.equal(appearance.matchPreset({ ...discord, reduceMotion: true }), 'custom');
});

test('default appearance matches the Chill preset', () => {
  const defaults = {
    theme: 'system',
    accent: '#3ee0a3',
    shape: 'soft',
    background: 'default',
    messageStyle: 'bubbles',
    fontScale: 'normal',
    reduceMotion: false,
    highContrast: false,
  };
  assert.equal(appearance.matchPreset(defaults), 'chill');
});
