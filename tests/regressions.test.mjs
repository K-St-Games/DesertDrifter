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
const { Controls } = await import('../src/input/Controls.js');

function pauseScene(ufoDeadlineTick) {
  let pauseRequested = false;
  const scene = Object.assign(new GameScene(), {
    tick: 120,
    paused: false,
    gameOver: false,
    stepAccumulator: 0,
    debug: { update() {} },
    controls: {
      // WP-B4: update() samples once per frame; the edge is consumed here.
      sample() {
        const pause = pauseRequested;
        pauseRequested = false;
        return { steer: 0, speedDelta: 0, restart: false, pause, mute: false };
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
// syncs the body from the game object (preUpdate), integrates body velocities
// and runs exactly one pass over the registered overlap callbacks, while
// world.postUpdate() pushes body.position - prevFrame back to the game object
// (Body.postUpdate). The game object is never written by update() itself
// (cf. World.update / World.postUpdate in phaser@3.90.0,
// physics/arcade/World.js).

function steppedScene({ steerScript = () => ({ left: false, right: false }), obstacleAt = null } = {}) {
  globalThis.Phaser.Math = {
    Between: (lo) => lo, // deterministic: draw the low bound (no shake: car stays on road)
    Linear: (a, b, t) => a + (b - a) * t,
    Distance: { Between: () => 1000 },
  };
  const worldCalls = [];
  const postUpdateCalls = [];
  const overlapFires = [];
  const colliders = [];
  const car = {
    x: 240, y: 400, angle: 0, velocityX: 0, velocityY: 0,
    setVelocity() { this.velocityX = 0; this.velocityY = 0; },
    setVelocityX(v) { this.velocityX = v; },
    setAngle(a) { this.angle = a; },
    setTint() {},
  };
  // WP-A4 review: one fake Arcade body for the car, mirroring the Phaser 3.90
  // contract (Body.preUpdate syncs the body FROM the game object, Body.update
  // integrates velocity into body.position, Body.postUpdate pushes
  // body.position - prevFrame back to the game object). The game object is
  // never written by update(); only postUpdate() moves it. Code that snapshots
  // before postUpdate and restores afterwards (the old A4 bug) freezes
  // velocity-driven sprites at their spawn X.
  const carBody = {
    position: { x: car.x, y: car.y },
    prevFrame: { x: car.x, y: car.y },
  };
  const trailer = { x: 240, y: 500, angle: 0, setAngle(a) { this.angle = a; } };
  const scene = Object.assign(new GameScene(), {
    tick: 0,
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
      // WP-B4: one sample per rendered frame; every step() in the frame shares
      // the returned object. steerScript keys on the tick the next step will use.
      sampleCalls: 0,
      sample() {
        this.sampleCalls++;
        const { left, right } = steerScript(scene.tick + 1);
        return {
          steer: left ? -1 : right ? 1 : 0,
          speedDelta: 0,
          restart: false,
          pause: false,
          mute: false,
        };
      },
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
        update(time, deltaMs) {
          worldCalls.push([time, deltaMs]);
          // preUpdate: sync the body from the game object, then integrate
          // velocity into body.position (collideWorldBounds clamps the body).
          carBody.position.x = car.x;
          carBody.position.y = car.y;
          carBody.prevFrame.x = car.x;
          carBody.prevFrame.y = car.y;
          carBody.position.x += car.velocityX * (deltaMs / 1000);
          if (carBody.position.x > 480) carBody.position.x = 480; // as on the car
          if (carBody.position.x < 0) carBody.position.x = 0;
          // Exactly one collider pass per call, like World.update/step.
          for (const cb of colliders) cb();
        },
        postUpdate() {
          postUpdateCalls.push(1);
          // Like Body.postUpdate: gameObject += body.position - prevFrame.
          car.x += carBody.position.x - carBody.prevFrame.x;
          car.y += carBody.position.y - carBody.prevFrame.y;
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
  return { scene, car, trailer, worldCalls, postUpdateCalls, overlapFires, colliders, samples: () => scene.controls.sampleCalls };
}

function runFrames(scene, totalSteps, frameMs) {
  // Feed render frames until totalSteps gameplay steps have run.
  let guard = totalSteps * 10 + 10;
  while (scene.tick < totalSteps && guard-- > 0) scene.update(0, frameMs);
  assert.equal(scene.tick, totalSteps, 'frame driver reached the target step count');
}

test('WP-B2: world.update is driven exactly once per step with the fixed dt', () => {
  const { scene, worldCalls, postUpdateCalls } = steppedScene();
  try {
    // Mixed frame cadence (60 Hz, 120 Hz, hitches): steps, not frames, drive physics.
    for (const dt of [16.6667, 8.3333, 8.3333, 33.3333, 8.3333, 100]) scene.update(0, dt);
    assert.ok(scene.tick > 0);
    assert.equal(worldCalls.length, scene.tick, 'one world update per gameplay step');
    assert.equal(postUpdateCalls.length, scene.tick, 'one body->sprite sync per gameplay step');
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
  // WP-A4: checkpoints read SIM positions (renderCurr), not game objects:
  // after update() the objects hold the display blend, which legitimately
  // differs by cadence (interpolation alpha), while the sim must not.
  const simXY = (scene, o) => {
    const s = scene.renderCurr && scene.renderCurr.sprites.get(o);
    return s ? [s.x, s.y] : [o.x, o.y];
  };
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
            trace[checkpoints[next]] = [simXY(scene, car), simXY(scene, trailer)];
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
    assert.ok(Math.abs(traces['60Hz'][n][0][0] - traces['120Hz'][n][0][0]) <= 0.01, `car.x@${n} same`);
    assert.ok(Math.abs(traces['60Hz'][n][0][1] - traces['120Hz'][n][0][1]) <= 0.01, `car.y@${n} same`);
    assert.ok(Math.abs(traces['60Hz'][n][1][0] - traces['120Hz'][n][1][0]) <= 0.01, `trailer.x@${n} same`);
    assert.ok(Math.abs(traces['60Hz'][n][1][1] - traces['120Hz'][n][1][1]) <= 0.01, `trailer.y@${n} same`);
  }
  // Tap math: 10 steps x 200 px/s / 60 = 33.333 px right of start, then the
  // trailer keeps converging; both cadences must agree exactly.
  assert.ok(Math.abs(traces['60Hz'][60][0][0] - (240 + (10 * 200) / 60)) <= 0.01);
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

// --- WP-B4: per-step input object ---
//
// GameScene.update() samples Controls.sample() once per rendered frame and
// hands the same object to every step() that frame; step() never reads live
// keyboard/pointer state. Touch zones are unchanged (y<320 boost, y>500
// brake, x<240 left else right) and the high-score form's
// disable/enableGlobalCapture handling is untouched.

function fakeKeyboardControls() {
  const key = () => ({ isDown: false, justDown: false });
  const cursors = { up: key(), down: key(), left: key(), right: key(), space: key() };
  const byCode = { A: key(), D: key(), W: key(), S: key(), M: key(), P: key() };
  const pointer = { isDown: false, x: 0, y: 0 };
  globalThis.Phaser.Input = {
    Keyboard: {
      KeyCodes: { A: 'A', D: 'D', W: 'W', S: 'S', M: 'M', P: 'P' },
      JustDown: (k) => !!k.justDown,
    },
  };
  const controls = new Controls({
    input: {
      keyboard: {
        createCursorKeys: () => cursors,
        addKey: (code) => byCode[code],
      },
      activePointer: pointer,
    },
  });
  return { controls, cursors, byCode, pointer };
}

test('WP-B4: sample maps keyboard steering and speed keys (left wins ties)', () => {
  const { controls, cursors, byCode } = fakeKeyboardControls();
  assert.deepEqual(
    controls.sample(),
    { steer: 0, speedDelta: 0, restart: false, pause: false, mute: false },
  );
  cursors.left.isDown = true;
  assert.equal(controls.sample().steer, -1);
  cursors.left.isDown = false;
  byCode.D.isDown = true;
  assert.equal(controls.sample().steer, 1);
  cursors.left.isDown = true; // both held: left wins, as steer() did
  assert.equal(controls.sample().steer, -1);
  cursors.left.isDown = false;
  byCode.D.isDown = false;

  cursors.up.isDown = true;
  assert.equal(controls.sample().speedDelta, 4);
  cursors.up.isDown = false;
  byCode.S.isDown = true;
  assert.equal(controls.sample().speedDelta, -0.5);
  byCode.W.isDown = true;
  assert.equal(controls.sample().speedDelta, 3.5);
});

test('WP-B4: sample keeps the touch zones for boost/brake/steer', () => {
  const { controls, pointer } = fakeKeyboardControls();
  pointer.isDown = true;
  pointer.y = 100; pointer.x = 400; // top area = boost, right half
  let s = controls.sample();
  assert.equal(s.speedDelta, 4);
  assert.equal(s.steer, 1);
  pointer.y = 600; pointer.x = 100; // bottom area = brake, left half
  s = controls.sample();
  assert.equal(s.speedDelta, -0.5);
  assert.equal(s.steer, -1);
  pointer.y = 400; pointer.x = 100; // middle band: no speed change, still steers
  s = controls.sample();
  assert.equal(s.speedDelta, 0);
  assert.equal(s.steer, -1);
});

test('WP-B4: sample carries pause/mute edges and the restart press', () => {
  const { controls, cursors, byCode, pointer } = fakeKeyboardControls();
  byCode.P.justDown = true;
  assert.equal(controls.sample().pause, true);
  byCode.P.justDown = false;
  byCode.M.justDown = true;
  assert.equal(controls.sample().mute, true);
  byCode.M.justDown = false;
  assert.deepEqual([controls.sample().pause, controls.sample().mute], [false, false]);
  cursors.space.isDown = true;
  assert.equal(controls.sample().restart, true);
  cursors.space.isDown = false;
  assert.equal(controls.sample().restart, false);
  pointer.isDown = true; // any touch counts as a restart press on the game-over screen
  assert.equal(controls.sample().restart, true);
});

test('WP-B4: step consumes only the passed object (no live input reads)', () => {
  const { scene, car } = steppedScene();
  try {
    // Any live hardware read throws: step must use only its argument.
    scene.controls = new Proxy({}, { get() { throw new Error('step read live input'); } });
    const y0 = scene.road.tilePositionY;
    scene.step({ steer: 1, speedDelta: 0, restart: false, pause: true, mute: true });
    assert.equal(car.velocityX, 200);
    assert.equal(car.angle, 5);
    assert.equal(scene.tick, 1);
    assert.equal(scene.paused, false, 'step ignores edge flags');
    assert.ok(Math.abs(scene.road.tilePositionY - (y0 - scene.speed * 2)) < 1e-9);
    scene.step({ steer: -1, speedDelta: -0.5, restart: true, pause: false, mute: false });
    assert.equal(car.velocityX, -200);
    assert.equal(car.angle, -5);
    assert.equal(scene.tick, 2);
    assert.equal(scene.gameOver, false, 'step ignores the restart flag');
  } finally {
    delete globalThis.Phaser.Math;
  }
});

test('WP-B4: update samples once per frame; edges fire once, not per step', () => {
  const { scene, samples, worldCalls } = steppedScene();
  try {
    scene.update(0, 100); // a hitch frame runs several steps
    assert.equal(samples(), 1, 'one sample per rendered frame');
    assert.ok(scene.tick > 1, 'the frame ran several steps');
    assert.equal(worldCalls.length, scene.tick, 'one world update per step');
  } finally {
    delete globalThis.Phaser.Math;
  }
});

test('WP-B4: mute/pause/restart edges are handled once per frame', () => {
  const { scene } = steppedScene();
  try {
    // Mute: one toggle even on a multi-step frame.
    let toggles = 0;
    scene.audio.toggleMute = () => { toggles++; return true; };
    scene.sound = { mute: false };
    scene.controls = { sample: () => ({ steer: 0, speedDelta: 0, restart: false, pause: false, mute: true }) };
    scene.update(0, 100);
    assert.equal(toggles, 1);

    // Pause: toggles once and no steps run.
    scene.controls = { sample: () => ({ steer: 0, speedDelta: 0, restart: false, pause: true, mute: false }) };
    const tickBefore = scene.tick;
    scene.update(0, 100);
    assert.equal(scene.paused, true);
    assert.equal(scene.tick, tickBefore);

    // Restart: one call on the game-over screen after the lockout.
    scene.paused = false;
    scene.gameOver = true;
    scene.tick = 100;
    scene.gameOverAt = 0;
    scene.form = { isVisible: () => false };
    let restarts = 0;
    scene.restartGame = () => { restarts++; };
    scene.controls = { sample: () => ({ steer: 0, speedDelta: 0, restart: true, pause: false, mute: false }) };
    scene.update(0, 100);
    assert.equal(restarts, 1);
  } finally {
    delete globalThis.Phaser.Math;
  }
});

// --- WP-A4: sprite jitter (ISSUE-4) ---
//
// Proven cause is (b): the fixed 60 Hz step runs 0, 1 or 2 times per rendered
// frame, so at 120 Hz+ on-screen motion alternates 0/~2.2 px (WP-A0 measured
// 1.09+-1.09 px/frame; a node model of the accumulator reproduces it and shows
// integer rounding alone still fails the band). Fix: display-only render
// interpolation between the last two sim states. Sim/collision positions are
// untouched: update() restores exact sim positions before stepping, and the
// blend never writes physics bodies (so the key-0 overlay still tracks).
// WP-A4 review: step() also calls world.postUpdate() inside the step so the
// snapshot sees body->sprite sync; without it restoreSimPositions() discards
// the scene POST_UPDATE sync every frame and velocity-driven X never
// accumulates (the car sat at x=240). The fake world above models that
// contract, so the steering test below fails against the old behaviour.

test('WP-A4 review: 60 held-right ticks move the car ~200 px (no frozen X)', () => {
  // Mirrors the browser repro (spawning disabled, ArrowRight held 60 ticks):
  // with the old snapshot-before-sync bug the car stayed at x=240.
  // NOTE: read SIM (renderCurr), not the game object: after update() the
  // object holds the display blend, which legitimately lags the sim by up to
  // one step (same reason the B2 tap checkpoints read renderCurr).
  const { scene, car } = steppedScene({ steerScript: () => ({ left: false, right: true }) });
  // Deterministic zero shake: the Between stub draws the low bound (-2),
  // which would drag the off-road car; the browser draws mean ~0.
  const between = globalThis.Phaser.Math.Between;
  globalThis.Phaser.Math.Between = () => 0;
  try {
    runFrames(scene, 60, TUNING.stepMs);
    const simX = scene.renderCurr.sprites.get(car).x;
    assert.ok(Math.abs(simX - (240 + (60 * 200) / 60)) <= 0.01, `sim advances ~200 px in 60 ticks (got ${simX})`);
    assert.ok(car.x >= 240 + 190, `display moved with the sim (dx=${car.x - 240})`);
  } finally {
    globalThis.Phaser.Math.Between = between;
    delete globalThis.Phaser.Math;
  }
});

function jitterScene() {
  // steppedScene() with a scrolling obstacle, like the real SpawnSystem:
  // child.y += currentSpeed * 2 per step. Bodies start as copies of the
  // sprite and must never be touched by the display blend.
  const built = steppedScene();
  const { scene } = built;
  const kids = [];
  const spawn = (y = -50) => {
    const o = { x: 240, y, active: true, body: { x: 240, y } };
    kids.push(o);
    return o;
  };
  scene.spawner = {
    update(tick, currentSpeed) {
      for (const o of kids) if (o.active) o.y += currentSpeed * 2;
    },
    group: { getChildren: () => kids.filter((o) => o.active) },
    clear() { kids.length = 0; },
    start() {},
  };
  return { ...built, kids, spawn };
}

function driveFrames(scene, ticks, frameMs) {
  // Run rendered frames until ticks gameplay steps ran; returns per-frame
  // records: display y of the first obstacle, display roadY, renderAlpha.
  const recs = [];
  const guard = ticks * 20 + 10;
  let n = 0;
  const kidsOf = () => scene.spawner.group.getChildren();
  while (scene.tick < ticks && n++ < guard) {
    scene.update(0, frameMs);
    const kids = kidsOf();
    recs.push({
      tick: scene.tick,
      alpha: scene.renderAlpha,
      dispY: kids.length ? kids[0].y : null,
      roadY: scene.road.tilePositionY,
    });
  }
  assert.equal(scene.tick, ticks, 'frame driver reached the target step count');
  return recs;
}

test('WP-A4: interpolation factor stays in [0,1] and display deltas stay in band', () => {
  for (const [label, frameMs] of [['60Hz', TUNING.stepMs], ['120Hz', TUNING.stepMs / 2], ['144Hz', 1000 / 144]]) {
    const { scene, spawn } = jitterScene();
    try {
      spawn();
      const recs = driveFrames(scene, 300, frameMs);
      for (const r of recs) {
        assert.ok(r.alpha >= 0 && r.alpha <= 1, `${label}: alpha ${r.alpha} in [0,1]`);
      }
      // Steady state only: interpolation has one step of display latency, so
      // the first two rendered frames legitimately show ~0 movement.
      const dys = [];
      for (let i = 1; i < recs.length; i++) {
        if (recs[i].tick >= 2) dys.push(recs[i].dispY - recs[i - 1].dispY);
      }
      const mean = dys.reduce((a, b) => a + b, 0) / dys.length;
      assert.ok(mean > 0, `${label}: moves down on average`);
      for (const d of dys) {
        assert.ok(d >= 0.5 * mean && d <= 1.5 * mean, `${label}: per-frame dy ${d} within 0.5x-1.5x of ${mean}`);
      }
      // Same band for the road scroll: sprites move with the road, not
      // against it (ISSUE-4 symptom).
      const rds = [];
      for (let i = 1; i < recs.length; i++) {
        if (recs[i].tick >= 2) rds.push(recs[i - 1].roadY - recs[i].roadY);
      }
      const rmean = rds.reduce((a, b) => a + b, 0) / rds.length;
      for (const d of rds) {
        assert.ok(d >= 0.5 * rmean && d <= 1.5 * rmean, `${label}: per-frame road dy ${d} in band`);
      }
    } finally {
      delete globalThis.Phaser.Math;
    }
  }
});

test('WP-A4: sim/collision positions are bit-identical across cadences', () => {
  // Positions the physics step actually sees (recorded inside world.update,
  // after the obstacle scroll but before any display write) must be exactly
  // what the sim computes: any display-blend leakage is cadence-dependent
  // and would show up here.
  const runs = {};
  for (const [label, frameMs] of [['60Hz', TUNING.stepMs], ['120Hz', TUNING.stepMs / 2], ['144Hz', 1000 / 144]]) {
    const { scene, spawn } = jitterScene();
    try {
      const obstacle = spawn();
      const seen = [];
      const inner = scene.physics.world.update.bind(scene.physics.world);
      scene.physics.world.update = (t, dt) => {
        seen.push([scene.tick, scene.speed, obstacle.y]);
        return inner(t, dt);
      };
      driveFrames(scene, 300, frameMs);
      runs[label] = {
        seen,
        simRoadY: scene.renderCurr.roadY,
        simObstacleY: scene.renderCurr.sprites.get(obstacle).y,
      };
    } finally {
      delete globalThis.Phaser.Math;
    }
  }
  delete globalThis.Phaser.Math;
  assert.deepEqual(runs['120Hz'].seen, runs['60Hz'].seen, 'collision inputs identical at 120Hz');
  assert.deepEqual(runs['144Hz'].seen, runs['60Hz'].seen, 'collision inputs identical at 144Hz');
  assert.equal(runs['120Hz'].simRoadY, runs['60Hz'].simRoadY, 'sim road identical');
  assert.equal(runs['120Hz'].simObstacleY, runs['60Hz'].simObstacleY, 'sim obstacle identical');
  // Closed form: each tick advances the obstacle and the road by speed*2.
  const { seen } = runs['60Hz'];
  assert.equal(seen.length, 300);
  let y = -50;
  let roadY = 0;
  for (const [, speed, oy] of seen) {
    y += speed * 2;
    roadY -= speed * 2;
    assert.ok(Math.abs(oy - y) < 1e-9, 'obstacle sim follows speed*2 per tick');
  }
  assert.ok(Math.abs(runs['60Hz'].simObstacleY - y) < 1e-9);
  assert.ok(Math.abs(runs['60Hz'].simRoadY - roadY) < 1e-9);
});

test('WP-A4: bodies are never touched by the display blend (overlay still tracks)', () => {
  const { scene, spawn } = jitterScene();
  try {
    const obstacle = spawn();
    const bodyBefore = JSON.parse(JSON.stringify(obstacle.body));
    driveFrames(scene, 200, TUNING.stepMs / 2); // 120 Hz: every frame blends
    assert.deepEqual(obstacle.body, bodyBefore, 'interpolation never writes bodies');
    assert.notDeepEqual([obstacle.x, obstacle.y], [obstacle.body.x, obstacle.body.y],
      'display legitimately differs from the (sim-true) body mid-frame');
  } finally {
    delete globalThis.Phaser.Math;
  }
});

test('WP-A4: spawn/destroy mid-run cannot poison the blend', () => {
  const { scene, kids, spawn } = jitterScene();
  try {
    spawn();
    driveFrames(scene, 60, TUNING.stepMs / 2);
    // Spawn with no prev entry: renders at its exact sim position, no NaN.
    const late = spawn(-50);
    scene.update(0, TUNING.stepMs); // full-step frame: guaranteed >= 1 step
    assert.ok(scene.tick > 60, 'a step ran with the late spawn present');
    assert.ok(Number.isFinite(late.y), 'late spawn renders a finite position');
    assert.ok(Math.abs(late.y - scene.renderCurr.sprites.get(late).y) <= 2.5,
      'spawn without prev renders within one step of sim');
    driveFrames(scene, 120, TUNING.stepMs / 2);
    // Destroy: pruned from the snapshot, no stale writes, no throw.
    late.active = false;
    kids.splice(kids.indexOf(late), 1);
    scene.update(0, TUNING.stepMs / 2);
    scene.update(0, TUNING.stepMs);
    assert.equal(scene.renderCurr.sprites.has(late), false, 'destroyed obstacle pruned');
  } finally {
    delete globalThis.Phaser.Math;
  }
});

test('WP-A4: restartGame clears interpolation state', () => {
  const { scene, car, trailer, spawn } = jitterScene();
  try {
    Object.assign(car, {
      clearTint() {}, setPosition(x, y) { this.x = x; this.y = y; },
    });
    Object.assign(trailer, {
      clearTint() {}, setPosition(x, y) { this.x = x; this.y = y; },
    });
    Object.assign(scene, {
      seedText: 'a4-restart',
      rng: createGameplayRng('a4-restart'),
      audio: { resetEngine() {}, updateEngineSpeed() {}, updateUfo() {} },
      highScoreText: { setVisible() {} },
      scoreText: { setText() {}, setStyle() {} },
      ufo: { active: false, state: 'idle', update() {}, reset() {} },
    });
    spawn();
    driveFrames(scene, 60, TUNING.stepMs / 2);
    assert.ok(scene.renderCurr !== null, 'interpolation state built up');
    scene.gameOver = true;
    scene.restartGame();
    assert.equal(scene.renderPrev, null, 'prev cleared');
    assert.equal(scene.renderCurr, null, 'curr cleared');
    assert.equal(scene.renderAlpha, null, 'alpha cleared');
    // Next frames rebuild cleanly from the reset positions.
    driveFrames(scene, 60, TUNING.stepMs / 2);
    assert.ok(scene.renderCurr !== null);
    for (const [, p] of scene.renderCurr.sprites) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    }
  } finally {
    delete globalThis.Phaser.Math;
  }
});
