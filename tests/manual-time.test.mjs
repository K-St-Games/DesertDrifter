import assert from 'node:assert/strict';
import test from 'node:test';
globalThis.Phaser = { Scene: class {} };
const { GameScene } = await import('../src/scenes/GameScene.js');

test('manual advancement suspends the real-time driver and rejects invalid durations', () => {
  let sleeps = 0;
  const scene = Object.assign(new GameScene(), {
    tick: 0, paused: false, gameOver: false,
    game: { loop: { sleep() { sleeps++; } } },
    restoreSimPositions() {}, snapshotRenderPositions() { return {}; },
    step() { this.tick++; },
  });
  assert.equal(scene.advanceTime(1000), 60);
  assert.equal(scene.advanceTime(1000), 60);
  assert.equal(scene.tick, 120);
  assert.equal(sleeps, 2);
  for (const ms of [NaN, Infinity, -1]) assert.throws(() => scene.advanceTime(ms), RangeError);
  assert.equal(scene.tick, 120);
});
