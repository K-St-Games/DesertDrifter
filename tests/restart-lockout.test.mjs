import assert from 'node:assert/strict';
import test from 'node:test';
globalThis.Phaser = { Scene: class {} };
const { GameScene } = await import('../src/scenes/GameScene.js');
const { TUNING } = await import('../src/config.js');

test('held restart becomes available after a crash without advancing gameplay', () => {
  let restarts = 0;
  let formVisible = false;
  const scene = Object.assign(new GameScene(), {
    tick: 100, gameOverAt: 100, gameOver: true, paused: false, restartElapsedMs: 0,
    controls: {
      muteJustPressed: () => false, pauseJustPressed: () => false, restartRequested: () => true,
      sample: () => ({ mute: false, pause: false, restart: true }),
    },
    ufo: { active: false }, spawner: { group: { getChildren: () => [] } },
    debug: { update() {} }, form: { isVisible: () => formVisible },
    restartGame() { restarts++; },
  });
  const lockoutMs = TUNING.restartLockoutSteps * TUNING.stepMs;
  scene.update(0, lockoutMs - 1);
  assert.equal(restarts, 0);
  formVisible = true;
  scene.update(0, 2);
  assert.equal(restarts, 0, 'initials form still blocks restart');
  formVisible = false;
  scene.update(0, 1);
  assert.equal(restarts, 1);
  assert.equal(scene.tick, 100, 'gameplay remains frozen');
});
