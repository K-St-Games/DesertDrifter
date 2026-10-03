import assert from 'node:assert/strict';
import test from 'node:test';

// These checks exercise scene logic without initializing a renderer or audio.
globalThis.Phaser = { Scene: class {} };
const { GameScene } = await import('../src/scenes/GameScene.js');
const { SpawnSystem } = await import('../src/systems/SpawnSystem.js');
const { UfoSystem } = await import('../src/systems/UfoSystem.js');
const { TUNING, UFO } = await import('../src/config.js');

function pauseScene(ufoDeadlineTick) {
  let pauseRequested = false;
  const scene = Object.assign(new GameScene(), {
    tick: 120,
    paused: false,
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
    spawner: { nextSpawnTick: 240, group: { getChildren: () => [] } },
    ufo: { active: false, nextSpawnTick: ufoDeadlineTick },
  });
  return {
    scene,
    update(deltaMs, toggle = false) {
      pauseRequested = toggle;
      scene.update(0, deltaMs);
    },
  };
}

test('pause freezes the gameplay clock so cooldowns do not elapse', () => {
  const { scene, update } = pauseScene(300);
  // Pause on; simulated wall-clock passes but no steps run, so tick freezes.
  update(0, true);
  assert.equal(scene.paused, true);
  // Mirror of GameScene.step()'s clock: the stub advances tick like a step would.
  let steps = 0;
  scene.step = () => { steps++; scene.tick++; };
  update(5000);
  update(5000);
  assert.equal(steps, 0);
  assert.equal(scene.tick, 120);
  assert.equal(scene.spawner.nextSpawnTick, 240);
  assert.equal(scene.ufo.nextSpawnTick, 300);
  // No pausedMs fix-up exists any more: resume and the remaining cooldowns
  // are simply deadline minus tick.
  update(0, true);
  assert.equal(scene.paused, false);
  assert.equal(scene.spawner.nextSpawnTick - scene.tick, 120);
  assert.equal(scene.ufo.nextSpawnTick - scene.tick, 180);
  // Post-resume frames advance the clock again: tick tracks steps exactly,
  // so the remaining cooldowns shrink by exactly the steps run.
  update(100);
  update(100);
  assert.ok(steps > 0);
  assert.equal(scene.tick, 120 + steps);
  assert.equal(scene.spawner.nextSpawnTick - scene.tick, 240 - scene.tick);
  assert.equal(scene.ufo.nextSpawnTick - scene.tick, 300 - scene.tick);
});

test('pause preserves the unscheduled UFO first-spawn sentinel', () => {
  const { scene, update } = pauseScene(0);
  update(0, true);
  update(30000);
  update(0, true);
  assert.equal(scene.ufo.nextSpawnTick, 0);
});

test('pause does not advance fixed-step gameplay', () => {
  const { scene, update } = pauseScene(300);
  let steps = 0;
  scene.step = () => steps++;
  update(0, true);
  scene.update(0, 100);
  assert.equal(steps, 0);
  assert.equal(scene.stepAccumulator, 0);
});

test('spawn scheduling is tick-based with the same pacing as the old ms delays', () => {
  globalThis.Phaser.Math = { Between: (lo, hi) => Math.floor((lo + hi) / 2) };
  try {
    const spawned = [];
    const system = Object.assign(Object.create(SpawnSystem.prototype), {
      isGameOver: () => false,
      factory: {}, group: { children: { iterate() {} } },
      spawnObstacle: () => spawned.push(true),
      nextSpawnTick: 0,
    });
    system.start(0);
    assert.equal(system.nextSpawnTick, TUNING.firstSpawnDelaySteps);
    // Neutral speed 1: delayMs = 1500/0.8 = 1875 ms -> 112 steps (rounded).
    system.update(TUNING.firstSpawnDelaySteps, 1, 1);
    assert.equal(spawned.length, 0);
    system.update(TUNING.firstSpawnDelaySteps + 1, 1, 1);
    assert.equal(spawned.length, 1);
    assert.equal(system.nextSpawnTick, TUNING.firstSpawnDelaySteps + 1 + 112);
  } finally {
    delete globalThis.Phaser.Math;
  }
});

test('UFO respawn delay is tick-based and the first-spawn sentinel still works', () => {
  globalThis.Phaser.Math = {
    Between: (lo) => lo,
    Linear: (a, b) => b,
    Distance: { Between: () => 1000 },
  };
  try {
    const system = Object.assign(Object.create(UfoSystem.prototype), {
      active: false, state: 'idle', timer: 0, hoverCount: 0,
      targetX: 0, targetY: 0, attackCount: 0, nextSpawnTick: 0,
      sprite: { x: 0, y: 0, setPosition() {}, setVisible() {} },
      beam: { clear() {} },
    });
    // Below threshold: sentinel untouched.
    system.update(10, UFO.scoreThreshold - 1, { x: 240 }, false);
    assert.equal(system.nextSpawnTick, 0);
    // Threshold reached at tick 10: scheduled, spawns on the next tick.
    system.update(10, UFO.scoreThreshold, { x: 240 }, false);
    assert.equal(system.nextSpawnTick, 10);
    assert.equal(system.active, false);
    system.update(11, UFO.scoreThreshold, { x: 240 }, false);
    assert.equal(system.active, true);
  } finally {
    delete globalThis.Phaser.Math;
  }
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
        active: true, state, timer: 0,
        sprite: { x: 240, y: 200 }, beam,
        onBeamHit: () => hits++,
      });
      // Tick 0 is in the flicker "on" half (0 % 12 < 6).
      system.update(0, 2000, { x: 300 }, false);
      assert.deepEqual(points, [[160, 700], [320, 700]]);
      assert.equal(hits, state === 'firing' ? 1 : 0);
      system.update(0, 2000, { x: 321 }, false);
      assert.equal(hits, state === 'firing' ? 1 : 0);
    }
  } finally {
    UFO.beamHalfWidth = originalWidth;
  }
});

test('warning beam flicker follows the tick, not the wall clock', () => {
  for (const [tick, visible] of [[0, true], [5, true], [6, false], [11, false], [12, true]]) {
    let filled = false;
    const beam = {
      clear() {}, fillStyle() { filled = true; }, beginPath() {}, moveTo() {},
      lineTo() {}, closePath() {}, fillPath() {},
    };
    const system = Object.assign(Object.create(UfoSystem.prototype), {
      active: true, state: 'charging', timer: 0,
      sprite: { x: 240, y: 200 }, beam,
      onBeamHit: () => {},
    });
    system.update(tick, 2000, { x: 240 }, false);
    assert.equal(filled, visible, `tick ${tick}`);
  }
});
