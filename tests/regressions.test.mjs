import assert from 'node:assert/strict';
import test from 'node:test';

// These checks exercise scene logic without initializing a renderer or audio.
globalThis.Phaser = { Scene: class {} };
const { GameScene } = await import('../src/scenes/GameScene.js');
const { SpawnSystem } = await import('../src/systems/SpawnSystem.js');
const { UfoSystem } = await import('../src/systems/UfoSystem.js');
const { TUNING, UFO } = await import('../src/config.js');
const { GameplayRng, createGameplayRng, readSeedParam } = await import('../src/sim/rng.js');
const { applyBehavior } = await import('../src/behaviors.js');

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
  // WP-B3: spawn jitter draws from the injected gameplay RNG (midpoint stub),
  // not Phaser.Math.
  const spawned = [];
  const system = Object.assign(Object.create(SpawnSystem.prototype), {
    isGameOver: () => false,
    factory: {}, group: { children: { iterate() {} } },
    rng: { int: (lo, hi) => Math.floor((lo + hi) / 2) },
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
});

test('UFO respawn delay is tick-based and the first-spawn sentinel still works', () => {
  // WP-B3: UFO target picks draw from the injected gameplay RNG. Linear and
  // Distance stay on Phaser.Math (pure math, no randomness); Between is
  // deliberately absent, so any gameplay draw from Phaser.Math would throw.
  globalThis.Phaser.Math = {
    Linear: (a, b) => b,
    Distance: { Between: () => 1000 },
  };
  try {
    const system = Object.assign(Object.create(UfoSystem.prototype), {
      active: false, state: 'idle', timer: 0, hoverCount: 0,
      targetX: 0, targetY: 0, attackCount: 0, nextSpawnTick: 0,
      rng: { int: (lo) => lo },
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

// --- WP-B2: physics advances exactly once per gameplay step ---
//
// The harness below drives the REAL GameScene.update()/step()/hitObstacle()
// with stubbed rendering/audio/input and a minimal fake Arcade world. The fake
// mirrors the Phaser 3.90 contract GameScene relies on: world.update(t, dtMs)
// with the fixed dt performs exactly one integration of body velocities plus
// exactly one pass over the registered overlap callbacks (cf. World.update /
// World.step in phaser@3.90.0, physics/arcade/World.js).

function steppedScene({ steerScript = () => ({ left: false, right: false }), obstacleAt = null } = {}) {
  globalThis.Phaser.Math = {
    Between: (lo) => lo, // deterministic: draw the low bound (no shake: car stays on road)
    Linear: (a, b, t) => a + (b - a) * t,
    Distance: { Between: () => 1000 },
  };
  const worldCalls = [];
  const overlapFires = [];
  const colliders = [];
  const car = {
    x: 240, y: 400, angle: 0, velocityX: 0, velocityY: 0,
    setVelocity() { this.velocityX = 0; this.velocityY = 0; },
    setVelocityX(v) { this.velocityX = v; },
    setAngle(a) { this.angle = a; },
    setTint() {},
  };
  const trailer = { x: 240, y: 500, angle: 0, setAngle(a) { this.angle = a; } };
  const scene = Object.assign(new GameScene(), {
    tick: 0,
    rng: createGameplayRng('step-test'),
    speed: TUNING.baseSpeed,
    score: 0,
    gameOver: false,
    gameOverAt: 0,
    paused: false,
    stepAccumulator: 0,
    road: { tilePositionY: 0 },
    car,
    trailer,
    controls: {
      muteJustPressed: () => false,
      pauseJustPressed: () => false,
      speedDelta: () => 0,
      steer: () => steerScript(scene.tick + 1), // tick the upcoming step() will use
      restartRequested: () => false,
    },
    audio: {
      updateEngineSpeed() {}, updateUfo() {},
      silenceForGameOver() {}, playCrash() {},
    },
    scoreText: { setText() {} },
    multiplierText: { setVisible() {}, setText() {}, setStyle() {}, x: 0, y: 0 },
    ufo: { active: false, state: 'idle', update() {} },
    spawner: { update() {}, group: { getChildren: () => [] } },
    debug: { update() {} },
    pausedText: { setVisible() {} },
    cameras: { main: { shake() {} } },
    form: { isVisible: () => true },
    highScoreCalls: 0,
    physics: {
      pause() {}, resume() {},
      // WP-B2: disableUpdate() is an ArcadePhysics method. The fake World
      // deliberately has no such method, so a wrong call site
      // (this.physics.world.disableUpdate()) throws instead of silently
      // passing (that typo crashed boot: "disableUpdate is not a function").
      disableUpdateCalls: 0,
      disableUpdate() { this.disableUpdateCalls++; },
      world: {
        postUpdate() {},
        update(time, deltaMs) {
          worldCalls.push([time, deltaMs]);
          // One fixed integration, like Body.update with delta seconds.
          car.x += car.velocityX * (deltaMs / 1000);
          if (car.x > 480) car.x = 480; // collideWorldBounds, as on the car
          if (car.x < 0) car.x = 0;
          // Exactly one collider pass per call, like World.update/step.
          for (const cb of colliders) cb();
        },
      },
    },
  });
  scene.checkHighScore = () => { scene.highScoreCalls++; };
  if (obstacleAt) {
    const fireIfTouching = () => {
      overlapFires.push(scene.tick);
      if (Math.abs(car.x - obstacleAt.x) < 5 && Math.abs(car.y - obstacleAt.y) < 500) {
        scene.hitObstacle(car, obstacleAt);
      }
    };
    // create() registers one overlap per ship, both guarded by hitObstacle.
    colliders.push(fireIfTouching, fireIfTouching);
  }
  return { scene, car, trailer, worldCalls, overlapFires, colliders };
}

function runFrames(scene, totalSteps, frameMs) {
  // Feed render frames until totalSteps gameplay steps have run.
  let guard = totalSteps * 10 + 10;
  while (scene.tick < totalSteps && guard-- > 0) scene.update(0, frameMs);
  assert.equal(scene.tick, totalSteps, 'frame driver reached the target step count');
}

test('WP-B2: world.update is driven exactly once per step with the fixed dt', () => {
  const { scene, worldCalls } = steppedScene();
  try {
    // Mixed frame cadence (60 Hz, 120 Hz, hitches): steps, not frames, drive physics.
    for (const dt of [16.6667, 8.3333, 8.3333, 33.3333, 8.3333, 100]) scene.update(0, dt);
    assert.ok(scene.tick > 0);
    assert.equal(worldCalls.length, scene.tick, 'one world update per gameplay step');
    for (const [time, deltaMs] of worldCalls) {
      assert.equal(time, 0);
      assert.equal(deltaMs, TUNING.stepMs);
    }
  } finally {
    delete globalThis.Phaser.Math;
  }
});

test('WP-B2: physics detach uses ArcadePhysics.disableUpdate (not world)', () => {
  // Regression: create() called this.physics.world.disableUpdate(), which
  // does not exist in Phaser 3.90 (it lives on ArcadePhysics), crashing boot
  // with "disableUpdate is not a function".
  const { scene } = steppedScene();
  try {
    assert.equal(typeof scene.physics.world.disableUpdate, 'undefined', 'fake world has no such method');
    scene.detachPhysicsFromRenderLoop();
    assert.equal(scene.physics.disableUpdateCalls, 1, 'detached via ArcadePhysics');
    assert.throws(() => scene.physics.world.disableUpdate(), TypeError, 'wrong call site throws');
  } finally {
    delete globalThis.Phaser.Math;
  }
});

test('WP-B2: car/trailer X after N steps is identical at 60 Hz and 120 Hz cadence', () => {
  // 10-step steering tap (ticks 50..59): under the old render-driven physics
  // such a tap could integrate 0 or 1 extra frame-steps depending on render
  // phase; on the step-driven world it must be bit-identical.
  const steerScript = (tick) => ({ left: false, right: tick >= 50 && tick <= 59 });
  const traces = {};
  for (const [label, frameMs] of [['60Hz', TUNING.stepMs], ['120Hz', TUNING.stepMs / 2]]) {
    const { scene, car, trailer } = steppedScene({ steerScript });
    try {
      const trace = {};
      const checkpoints = [60, 300, 600];
      let next = 0;
      const frameDriver = () => {
        while (scene.tick < 600) {
          scene.update(0, frameMs);
          if (next < checkpoints.length && scene.tick >= checkpoints[next]) {
            trace[checkpoints[next]] = [car.x, trailer.x];
            next++;
          }
        }
      };
      frameDriver();
      traces[label] = trace;
    } finally {
      delete globalThis.Phaser.Math;
    }
    // steppedScene() re-installs the Math stub on the next construction.
  }
  delete globalThis.Phaser.Math;
  for (const n of [60, 300, 600]) {
    assert.ok(Math.abs(traces['60Hz'][n][0] - traces['120Hz'][n][0]) <= 0.01, `car.x@${n} same`);
    assert.ok(Math.abs(traces['60Hz'][n][1] - traces['120Hz'][n][1]) <= 0.01, `trailer.x@${n} same`);
  }
  // Tap math: 10 steps x 200 px/s / 60 = 33.333 px right of start, then the
  // trailer keeps converging; both cadences must agree exactly.
  assert.ok(Math.abs(traces['60Hz'][60][0] - (240 + (10 * 200) / 60)) <= 0.01);
});

test('WP-B2: scripted crash happens on the same tick at 60 Hz and 120 Hz; pause freezes the world', () => {
  const crashTicks = {};
  for (const [label, frameMs] of [['60Hz', TUNING.stepMs], ['120Hz', TUNING.stepMs / 2]]) {
    const obstacle = { x: 240, y: 400 };
    const { scene, worldCalls } = steppedScene({ obstacleAt: obstacle });
    try {
      runFrames(scene, 1, frameMs); // obstacle starts on the car: crash on tick 1
      assert.equal(scene.gameOver, true);
      crashTicks[label] = scene.gameOverAt;
      const callsAtCrash = worldCalls.length;
      // Pause mid-run: further frames must not step the world or the clock.
      scene.paused = true;
      const tickFrozen = scene.tick;
      scene.update(0, 16.6667);
      scene.update(0, 100);
      assert.equal(scene.tick, tickFrozen);
      assert.equal(worldCalls.length, callsAtCrash, 'no world steps while paused');
    } finally {
      delete globalThis.Phaser.Math;
    }
    // steppedScene() re-installs the Math stub on the next construction.
  }
  delete globalThis.Phaser.Math;
  assert.equal(crashTicks['60Hz'], crashTicks['120Hz'], 'crash on the same tick');
});

test('WP-B2: overlap callbacks run once per step and the crash guard handles re-entry', () => {
  const obstacle = { x: 240, y: 400 };
  const { scene, overlapFires } = steppedScene({ obstacleAt: obstacle });
  try {
    scene.update(0, TUNING.stepMs); // tick 1: both overlaps fire, one crash
    assert.equal(scene.gameOver, true);
    assert.equal(scene.gameOverAt, 1);
    assert.equal(overlapFires.length, 2, 'both ship overlaps ran once this step');
    assert.equal(scene.highScoreCalls, 1, 'hitObstacle body ran once despite re-entry');
    // A second overlapping step must not re-run the crash.
    scene.gameOverAt = 1;
    scene.hitObstacle(scene.car, obstacle);
    assert.equal(scene.gameOverAt, 1);
    assert.equal(scene.highScoreCalls, 1);
  } finally {
    delete globalThis.Phaser.Math;
  }
});

// --- WP-B3: gameplay RNG separate from cosmetic/audio ---
//
// One GameplayRng instance drives spawn picks, obstacle behaviors and UFO
// targets in draw order; HUD shake, terrain shake and the music offset stay
// on Math.random. SEED COMPATIBILITY: pre-B3 ?seed= replaced the global
// Math.random (one shared stream), so the same seed text now produces a
// different obstacle sequence — old seeds will NOT reproduce old runs.

test('WP-B3: same seed gives the same gameplay sequence, different seeds differ', () => {
  const seq = (seedText) => {
    const rng = createGameplayRng(seedText);
    return Array.from({ length: 50 }, (_, i) => (i % 2 ? rng.float() : rng.int(-100, 430)));
  };
  assert.deepEqual(seq('desert-7'), seq('desert-7'));
  assert.notDeepEqual(seq('desert-7'), seq('desert-8'));
});

test('WP-B3: unseeded runs vary (seeded from Math.random when ?seed= is absent)', () => {
  const realRandom = Math.random;
  try {
    Math.random = () => 0.1;
    const a = createGameplayRng(null);
    Math.random = () => 0.9;
    const b = createGameplayRng(null);
    assert.notEqual(a.state, b.state);
    const seq = (rng) => Array.from({ length: 20 }, () => rng.int(1, 100));
    assert.notDeepEqual(seq(a), seq(b));
    // ?seed= parsing: absent flag -> null (unseeded); explicit text passes through.
    assert.equal(readSeedParam(''), null);
    assert.equal(readSeedParam('?seed='), '');
    assert.equal(readSeedParam('?seed=desert-7'), 'desert-7');
  } finally {
    Math.random = realRandom;
  }
});

test('WP-B3: RNG primitives stay in range', () => {
  for (const rng of [createGameplayRng('bounds'), createGameplayRng()]) {
    assert.ok(Number.isInteger(rng.state));
    for (let i = 0; i < 200; i++) {
      const f = rng.float();
      assert.ok(f >= 0 && f < 1, 'float in [0, 1)');
      const v = rng.int(1, 6);
      assert.ok(v >= 1 && v <= 6, 'int inclusive');
    }
  }
  const fixed = createGameplayRng('bounds');
  for (let i = 0; i < 50; i++) assert.equal(fixed.int(5, 5), 5);
});

test('WP-B3: cosmetic/audio draws do not consume the gameplay stream', () => {
  const gameplay = (withNoise) => {
    const rng = createGameplayRng('music-timing');
    const out = [];
    for (let i = 0; i < 20; i++) {
      out.push(rng.int(1, 100));
      out.push(rng.float());
      if (withNoise) {
        // HUD shake, terrain shake, music start offset: Math.random only,
        // firing at whatever time the audio finishes loading.
        Math.random(); Math.random(); Math.random();
      }
    }
    return out;
  };
  assert.deepEqual(gameplay(true), gameplay(false));
});

test('WP-B3: spawn and behavior draws share one stream; reset replays the run', () => {
  const spawnWith = (rng, noise = false) => {
    const recorded = [];
    const system = Object.assign(Object.create(SpawnSystem.prototype), {
      isGameOver: () => false,
      factory: {
        createInGroup: (group, type, x, y) => {
          const entry = { type, x, y, vx: 0, av: 0 };
          recorded.push(entry);
          return {
            setVelocityX(v) { entry.vx = v; },
            setAngularVelocity(v) { entry.av = v; },
          };
        },
      },
      group: {},
      rng,
    });
    for (let i = 0; i < 30; i++) {
      system.spawnObstacle();
      if (noise) { Math.random(); Math.random(); }
    }
    return recorded.map((e) => [e.type, e.x, e.vx, e.av]);
  };
  const rng = createGameplayRng('convoy');
  const first = spawnWith(rng);
  assert.equal(first.length, 30);
  // Same seed, fresh stream: identical obstacle sequence (type, x, behavior velocities).
  assert.deepEqual(spawnWith(createGameplayRng('convoy')), first);
  // Interleaved cosmetic/audio timing changes nothing.
  assert.deepEqual(spawnWith(createGameplayRng('convoy'), true), first);
  // Reset (what restartGame does) replays the same run on the same instance.
  rng.reset('convoy');
  assert.deepEqual(spawnWith(rng), first);
  // Different seed: different run.
  assert.notDeepEqual(spawnWith(createGameplayRng('dust')), first);
});

test('WP-B3: UFO targets draw from the shared gameplay stream', () => {
  const targets = (seedText) => {
    const system = Object.assign(Object.create(UfoSystem.prototype), {
      active: false, state: 'idle', timer: 0, hoverCount: 0,
      targetX: 0, targetY: 0, attackCount: 0, nextSpawnTick: 0,
      rng: createGameplayRng(seedText),
      sprite: { x: 240, y: -100, setPosition(x, y) { this.x = x; this.y = y; }, setVisible() {} },
      beam: { clear() {} },
      onBeamHit() {},
    });
    globalThis.Phaser.Math = {
      Linear: (a, b) => b,
      Distance: { Between: () => 1000 },
    };
    try {
      system.update(10, UFO.scoreThreshold, { x: 240 }, false); // schedule
      system.update(11, UFO.scoreThreshold, { x: 240 }, false); // spawn: initial target
      return [system.targetX, system.targetY];
    } finally {
      delete globalThis.Phaser.Math;
    }
  };
  assert.deepEqual(targets('ufo-seed'), targets('ufo-seed'));
  assert.notDeepEqual(targets('ufo-seed'), targets('ufo-other'));
});

test('WP-B3: restartGame resets the gameplay stream for replayability', () => {
  const freshDraws = () => {
    const rng = createGameplayRng('replay-seed');
    return Array.from({ length: 5 }, () => rng.int(1, 1000));
  };
  const spawnerCalls = [];
  const scene = Object.assign(new GameScene(), {
    seedText: 'replay-seed',
    rng: createGameplayRng('replay-seed'),
    gameOver: true, score: 999, speed: 1.5, tick: 500, stepAccumulator: 3,
    audio: { resetEngine() {} },
    multiplierText: { setVisible() {}, setText() {} },
    highScoreText: { setVisible() {} },
    car: { clearTint() {}, setPosition() {} },
    trailer: { clearTint() {}, setPosition() {} },
    spawner: {
      clear() { spawnerCalls.push('clear'); },
      start(tick) { spawnerCalls.push(['start', tick]); },
    },
    ufo: { reset() {} },
    physics: { resume() {} },
    scoreText: { setText() {}, setStyle() {} },
  });
  // Mid-run consumption: the stream has advanced before the restart.
  scene.rng.int(1, 1000);
  scene.rng.int(1, 1000);
  scene.restartGame();
  assert.equal(scene.tick, 0);
  assert.deepEqual(
    Array.from({ length: 5 }, () => scene.rng.int(1, 1000)),
    freshDraws(),
  );
  assert.deepEqual(spawnerCalls, ['clear', ['start', 0]]);
});


test('off-road movement is identical despite different cosmetic random draws', () => {
  const run = (cosmeticValue) => {
    const { scene, car, trailer } = steppedScene();
    scene.rng = createGameplayRng('off-road');
    car.x = 100;
    trailer.x = 100;
    globalThis.Phaser.Math.Between = () => cosmeticValue;
    runFrames(scene, 30, TUNING.stepMs);
    return { car: [car.x, car.y], trailer: [trailer.x, trailer.y], rng: scene.rng.state };
  };
  assert.deepEqual(run(-2), run(2));
});
