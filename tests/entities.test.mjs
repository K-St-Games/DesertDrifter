import assert from 'node:assert/strict';
import test from 'node:test';

// WP-C2: the declarative entity table must pass boot-time validation, and
// each class of bad row must fail with a message naming the offending field.
import { ENTITIES, validateEntities } from '../src/entities.js';

function badRow(id, mutate) {
  const table = structuredClone(ENTITIES);
  mutate(table[id]);
  return table;
}

test('current entity table passes validation', () => {
  assert.equal(validateEntities(), true);
  assert.equal(validateEntities(structuredClone(ENTITIES)), true);
});

test('bad spawnZone fails with a field-specific message', () => {
  const table = badRow('rock', (row) => { row.spawnZone = 'moon'; });
  assert.throws(() => validateEntities(table), /spawnZone/);
});

test('missing spawnZone on a spawned entity fails with a field-specific message', () => {
  const table = badRow('rock', (row) => { delete row.spawnZone; });
  assert.throws(() => validateEntities(table), /spawnZone/);
});

test('unknown behavior id fails with a field-specific message', () => {
  const table = badRow('turtle', (row) => { row.behavior = { id: 'warp' }; });
  assert.throws(() => validateEntities(table), /behavior\.id/);
});

test('out-of-range collision ratio fails with a field-specific message', () => {
  const box = badRow('rock', (row) => { row.collision.widthRatio = 1.5; });
  assert.throws(() => validateEntities(box), /widthRatio/);
  const circle = badRow('turtle', (row) => { row.collision.radiusRatio = 0; });
  assert.throws(() => validateEntities(circle), /radiusRatio/);
});

test('file path not matching the baked sprite fails with a field-specific message', () => {
  const table = badRow('rock', (row) => { row.file = 'assets/sprites/pebble.png'; });
  assert.throws(() => validateEntities(table), /file/);
});

test('negative spawnWeight fails with a field-specific message', () => {
  const table = badRow('rock', (row) => { row.spawnWeight = -5; });
  assert.throws(() => validateEntities(table), /spawnWeight/);
});

test('negative points fails with a field-specific message', () => {
  const table = badRow('rock', (row) => { row.points = -10; });
  assert.throws(() => validateEntities(table), /points/);
});

test('unknown category fails with a field-specific message', () => {
  const table = badRow('rock', (row) => { row.category = 'pickup'; });
  assert.throws(() => validateEntities(table), /category/);
});
