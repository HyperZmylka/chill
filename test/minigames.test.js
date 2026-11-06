'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const miniGames = require('../minigames.js');

test('mini game catalog contains two unique bilingual games', () => {
  assert.equal(miniGames.catalog.length, 2);
  assert.deepEqual(miniGames.gameIds, ['last-circle', 'duel']);
  for (const game of miniGames.catalog) {
    assert.match(game.id, /^[a-z0-9-]+$/);
    assert.ok(game.titlePl.length > 0);
    assert.ok(game.titleEn.length > 0);
    assert.ok(game.descriptionPl.length > 0);
    assert.ok(game.descriptionEn.length > 0);
    assert.ok(game.controlsPl.length > 0);
    assert.ok(game.controlsEn.length > 0);
    assert.ok(game.tagsPl.length > 0);
    assert.ok(game.tagsEn.length > 0);
  }
});

test('installed games normalize to known unique ids', () => {
  assert.deepEqual(miniGames.normalizeInstalled(['duel', 'last-circle', 'duel', 'unknown', 42]), ['duel', 'last-circle']);
  assert.deepEqual(miniGames.normalizeInstalled('["last-circle","nope"]'), ['last-circle']);
  assert.deepEqual(miniGames.normalizeInstalled('not json'), []);
  assert.deepEqual(miniGames.normalizeInstalled(null), []);
});

test('storm radius holds, shrinks linearly and stops at the minimum', () => {
  assert.equal(miniGames.stormRadius(1000, 100, 0, 60, 10), 1000);
  assert.equal(miniGames.stormRadius(1000, 100, 10, 60, 10), 1000);
  assert.equal(miniGames.stormRadius(1000, 100, 40, 60, 10), 550);
  assert.equal(miniGames.stormRadius(1000, 100, 70, 60, 10), 100);
  assert.equal(miniGames.stormRadius(1000, 100, 500, 60, 10), 100);
});

test('storm radius refuses invalid ranges safely', () => {
  assert.equal(miniGames.stormRadius(500, 900, 30, 20), 500);
  assert.equal(miniGames.stormRadius(-10, 5, 30, 20), 0);
  assert.equal(miniGames.stormRadius(500, 100, -20, 20), 500);
});

test('duel and battle sessions expose the expected initial HUD', () => {
  assert.equal(miniGames.weapons.pistol.damage, 18);
  assert.equal(miniGames.weapons.shotgun.pellets, 6);
  assert.equal(miniGames.weapons.rifle.damage, 25);
  assert.equal(typeof miniGames.createGame, 'function');
});
