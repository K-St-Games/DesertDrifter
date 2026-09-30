import assert from 'node:assert/strict';
import test from 'node:test';

// These checks exercise scene logic without initializing a renderer or audio.
globalThis.Phaser = { Scene: class {} };
const { GameScene } = await import('../src/scenes/GameScene.js');
const { UfoSystem } = await import('../src/systems/UfoSystem.js');
const { UFO } = await import('../src/config.js');

function pauseScene(ufoDeadline) {
  let pauseRequested = false;
  const scene = Object.assign(new GameScene(), {
    time: { now: 1000 },
    paused: false,
    pauseStartedAt: null,
    gameOver: false,
    stepAccumulator: 0,
    debug: { update() {} },
    controls: {
      muteJustPressed: () => false,
      pauseJustPressed: () => {
        const requested = pauseRequested;
        pauseRequested = false;
        return requested;
      },
    },
    pausedText: { setVisible() {} },
    physics: { pause() {}, resume() {} },
    spawner: { nextSpawnTime: 2000, group: { getChildren: () => [] } },
    ufo: { active: false, nextSpawnTime: ufoDeadline },
  });
  return {
    scene,
    update(now, toggle = false) {
      scene.time.now = now;
      pauseRequested = toggle;
      scene.update(now, 0);
    },
  };
}

test('pause preserves obstacle and UFO cooldowns across repeated pauses', () => {
  const { scene, update } = pauseScene(3000);
  update(1000, true);
  update(6000);
  assert.equal(scene.spawner.nextSpawnTime, 2000);
  update(6000, true);
  assert.equal(scene.spawner.nextSpawnTime - scene.time.now, 1000);
  assert.equal(scene.ufo.nextSpawnTime - scene.time.now, 2000);
  assert.equal(scene.pauseStartedAt, null);

  update(6500, true);
  update(8500, true);
  assert.equal(scene.spawner.nextSpawnTime - scene.time.now, 500);
  assert.equal(scene.ufo.nextSpawnTime - scene.time.now, 1500);
});

test('pause preserves the unscheduled UFO first-spawn sentinel', () => {
  const { scene, update } = pauseScene(0);
  update(1000, true);
  update(11000, true);
  assert.equal(scene.ufo.nextSpawnTime, 0);
});

test('pause does not advance fixed-step gameplay', () => {
  const { scene, update } = pauseScene(3000);
  let steps = 0;
  scene.step = () => steps++;
  update(1000, true);
  scene.time.now = 5000;
  scene.update(5000, 100);
  assert.equal(steps, 0);
  assert.equal(scene.stepAccumulator, 0);
});

test('warning and firing beams use the configured width and collision bounds', () => {
  const originalWidth = UFO.beamHalfWidth;
  UFO.beamHalfWidth = 80;
  try {
    for (const state of ['charging', 'firing']) {
      const points = [];
      let hits = 0;
      const beam = {
        clear() {}, fillStyle() {}, beginPath() {}, moveTo() {},
        lineTo(x, y) { points.push([x, y]); },
        closePath() {}, fillPath() {},
      };
      const system = Object.assign(Object.create(UfoSystem.prototype), {
        scene: { time: { now: 50 } },
        active: true, state, timer: 0,
        sprite: { x: 240, y: 200 }, beam,
        onBeamHit: () => hits++,
      });
      system.update(2000, { x: 300 }, false);
      assert.deepEqual(points, [[160, 700], [320, 700]]);
      assert.equal(hits, state === 'firing' ? 1 : 0);
      system.update(2000, { x: 321 }, false);
      assert.equal(hits, state === 'firing' ? 1 : 0);
    }
  } finally {
    UFO.beamHalfWidth = originalWidth;
  }
});
