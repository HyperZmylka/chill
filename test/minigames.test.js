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

test('battle catalog advertises the 3D third-person controls', () => {
  const battle = miniGames.catalog.find((game) => game.id === 'last-circle');
  assert.ok(battle);
  assert.match(battle.descriptionPl, /trójwymiar/i);
  assert.match(battle.descriptionEn, /three-dimensional/i);
  assert.ok(battle.tagsPl.includes('3D'));
  assert.ok(battle.tagsEn.includes('3D'));
  for (const key of ['Spacja', 'Shift', 'E', 'R']) {
    assert.ok(battle.controlsPl.includes(key), `PL controls mention ${key}`);
  }
  for (const key of ['Space', 'Shift', 'E', 'R']) {
    assert.ok(battle.controlsEn.includes(key), `EN controls mention ${key}`);
  }
});

test('battle weapons expose range, magazine and reload data', () => {
  assert.equal(miniGames.version, 2);
  for (const weapon of Object.values(miniGames.weapons)) {
    assert.ok(weapon.range > 0);
    assert.ok(weapon.mag > 0);
    assert.ok(weapon.reserve > 0);
    assert.ok(weapon.reload > 0);
    assert.equal(typeof weapon.auto, 'boolean');
  }
  assert.equal(miniGames.battleConfig.botCount, 11);
  assert.ok(miniGames.battleConfig.arenaRadius > miniGames.battleConfig.stormMin);
});

test('camera basis is orthonormal and projects points around the screen centre', () => {
  const basis = miniGames.makeCameraBasis({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 });
  assert.equal(basis.forward.z, 1);
  assert.equal(basis.right.x, 1);
  assert.equal(basis.up.y, 1);
  assert.equal(miniGames.toCameraSpace({ x: 3, y: 2, z: 10 }, basis).z, 10);
  const projected = miniGames.projectPoint({ x: 0, y: 0, z: 10 }, basis, 100, 200, 100);
  assert.equal(projected.visible, true);
  assert.equal(projected.x, 100);
  assert.equal(projected.y, 50);
  assert.equal(projected.depth, 10);
  assert.equal(miniGames.projectPoint({ x: 0, y: 0, z: -5 }, basis, 100, 200, 100).visible, false);
  const segment = miniGames.projectSegment(
    { x: -2, y: 0, z: 10 },
    { x: 2, y: 0, z: 10 },
    basis,
    100,
    200,
    100,
  );
  assert.ok(segment);
  assert.equal(segment.ay, 50);
  assert.equal(segment.by, 50);
  assert.ok(segment.ax < segment.bx);
});

test('raycasts hit spheres, cylinders, boxes and arena ground safely', () => {
  const sphere = miniGames.raySphereHit({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, 1);
  assert.ok(sphere);
  assert.equal(sphere.distance, 4);
  assert.equal(miniGames.raySphereHit({ x: 0, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, 1), null);

  const cylinder = miniGames.rayCylinderHit({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 1, 2);
  assert.ok(cylinder);
  assert.equal(cylinder.distance, 1);

  const aabb = miniGames.rayAABBHit(
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 2, y: -1, z: -1 },
    { x: 4, y: 1, z: 1 },
  );
  assert.ok(aabb);
  assert.equal(aabb.distance, 2);

  const box = miniGames.rayBoxHit({ x: 0, y: 1, z: -5 }, { x: 0, y: 0, z: 1 }, { x: 0, z: 0, w: 2, d: 2, h: 2 });
  assert.ok(box);
  assert.equal(box.distance, 4);
  assert.equal(miniGames.rayBoxHit({ x: 0, y: 5, z: -5 }, { x: 0, y: 0, z: 1 }, { x: 0, z: 0, w: 2, d: 2, h: 2 }), null);
});

test('geometry and colour helpers clamp and blend values', () => {
  assert.equal(miniGames.circleBoxHit(1.5, 0, 1, { x: 0, z: 0, w: 2, d: 2 }), true);
  assert.equal(miniGames.circleBoxHit(3, 0, 1, { x: 0, z: 0, w: 2, d: 2 }), false);
  assert.deepEqual(miniGames.hexToRgb('#3ee0a3'), { r: 62, g: 224, b: 163 });
  assert.equal(miniGames.shadeColor('#ffffff', 0.5), 'rgb(128, 128, 128)');
  assert.equal(miniGames.normalizeAngle(Math.PI * 3), Math.PI);
  const clipped = miniGames.clipPolygonNear([
    { x: 0, y: 0, z: -1 },
    { x: 1, y: 0, z: 1 },
    { x: -1, y: 0, z: 1 },
  ], 0.09);
  assert.equal(clipped.length, 4);
  assert.ok(clipped.every((point) => point.z >= 0.09));
  assert.deepEqual(miniGames.clipPolygonNear([{ x: 0, y: 0, z: -2 }], 0.09), []);
});
