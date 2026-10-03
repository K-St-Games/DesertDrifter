// WP-B6: headless replay harness (test tooling only, never imported by src/).
//
// Builds a real GameScene with its real SpawnSystem/UfoSystem/RNG/behaviors
// and stubbed rendering/audio/input, following the WP-B5 regression tests.
// Phaser.Scene is stubbed before the src modules evaluate (GameScene extends
// it at import time); Phaser.Math gets deterministic stubs at scene build
// time (Between draws the low bound so cosmetic shake never moves the car;
// Linear/Distance are the real math, used by the trailer lerp and the UFO).
//
// No gameplay code is changed or wrapped: the driver calls the shipped
// scene.advanceTime() with the script from script.mjs and reads the shipped
// scene.renderGameToText() snapshots.

// Minimal stub so `class GameScene extends Phaser.Scene` can evaluate.
globalThis.Phaser ??= { Scene: class {} };
if (!globalThis.Phaser.Scene) globalThis.Phaser.Scene = class {};

const [{ GameScene }, { SpawnSystem }, { UfoSystem }, { TUNING }, { createGameplayRng }] =
  await Promise.all([
    import('../../src/scenes/GameScene.js'),
    import('../../src/systems/SpawnSystem.js'),
    import('../../src/systems/UfoSystem.js'),
    import('../../src/config.js'),
    import('../../src/sim/rng.js'),
  ]);

export { TUNING };
export { SEED, scriptedInput, CHECKPOINTS_RUN1, EXPECTED_CRASH_TICK, MAX_TICKS_RUN1, CHECKPOINTS_RUN2 } from './script.mjs';
import { SEED, scriptedInput, CHECKPOINTS_RUN1, EXPECTED_CRASH_TICK, MAX_TICKS_RUN1, CHECKPOINTS_RUN2 } from './script.mjs';

export function createReplayScene(seedText) {
  globalThis.Phaser.Math = {
    Between: (lo) => lo,
    Linear: (a, b, t) => a + (b - a) * t,
    Distance: { Between: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1) },
  };
  const kids = [];
  const group = {
    children: { iterate(fn) { [...kids].forEach(fn); } },
    getChildren: () => kids.filter((o) => o.active),
    clear() { kids.length = 0; },
  };
  const factory = {
    createInGroup: (grp, type, x, y) => {
      const o = {
        texture: { key: type },
        x, y, active: true, scored: false, vx: 0,
        setVelocityX(v) { this.vx = v; },
        setAngularVelocity() {},
        destroy() {
          this.active = false;
          const i = kids.indexOf(this);
          if (i >= 0) kids.splice(i, 1);
        },
      };
      kids.push(o);
      return o;
    },
    createSprite: (id, x, y) => ({
      texture: { key: id },
      x, y, active: true, angle: 0,
      setVisible() {}, setDepth() {},
      setPosition(px, py) { this.x = px; this.y = py; },
      setTint() {}, clearTint() {},
    }),
  };
  const scene = Object.assign(new GameScene(), {
    tick: 0,
    speed: TUNING.baseSpeed,
    score: 0,
    gameOver: false,
    gameOverAt: 0,
    paused: false,
    stepAccumulator: 0,
    renderPrev: null,
    renderCurr: null,
    renderAlpha: null,
    seedText,
    rng: createGameplayRng(seedText),
    road: { tilePositionY: 0 },
    car: {
      x: 240, y: 400, angle: 0, vx: 0,
      setVelocity() { this.vx = 0; },
      setVelocityX(v) { this.vx = v; },
      setAngle(a) { this.angle = a; },
      setTint() {}, clearTint() {},
      setPosition(x, y) { this.x = x; this.y = y; },
    },
    trailer: {
      x: 240, y: 500, angle: 0,
      setAngle(a) { this.angle = a; },
      setTint() {}, clearTint() {},
      setPosition(x, y) { this.x = x; this.y = y; },
    },
    audio: {
      updateEngineSpeed() {}, updateUfo() {},
      silenceForGameOver() {}, playCrash() {}, resetEngine() {},
    },
    scoreText: { setText() {}, setStyle() {} },
    multiplierText: { setVisible() {}, setText() {}, setStyle() {}, x: 0, y: 0 },
    highScoreText: { setText() {}, setVisible() {} },
    cameras: { main: { shake() {} } },
    add: {
      graphics: () => ({
        setDepth() {}, clear() {}, fillStyle() {},
        beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fillPath() {},
      }),
    },
    physics: {
      pause() {}, resume() {},
      add: { group: () => group },
      world: {
        update(time, deltaMs) {
          // One fixed integration per step, like the real Arcade world.
          const s = deltaMs / 1000;
          scene.car.x += scene.car.vx * s;
          if (scene.car.x > 480) scene.car.x = 480;
          if (scene.car.x < 0) scene.car.x = 0;
          for (const o of kids) if (o.active && o.vx) o.x += o.vx * s;
        },
      },
    },
  });
  // Skip the leaderboard DOM flow; the replay only needs the crash flag.
  scene.checkHighScore = () => {};
  scene.spawner = new SpawnSystem(scene, {
    factory,
    isGameOver: () => scene.gameOver,
    onScore: (points) => { scene.score += points; },
    rng: scene.rng,
  });
  scene.spawner.start(0);
  scene.ufo = new UfoSystem(scene, {
    factory,
    onBeamHit: (car, sprite) => scene.hitObstacle(car, sprite),
    rng: scene.rng,
  });
  return scene;
}

// Runs the full scripted replay: first run to the crash, restartGame(), then
// the post-restart run. Returns records of { phase, tick, snapshot } where
// snapshot is the raw renderGameToText() string.
export function runReplay() {
  const records = [];
  const scene = createReplayScene(SEED);
  const want1 = new Set(CHECKPOINTS_RUN1);
  const max1 = Math.max(...CHECKPOINTS_RUN1, EXPECTED_CRASH_TICK);

  // One advanceTime call per step keeps input keyed on the exact upcoming tick.
  while (!scene.gameOver && scene.tick < MAX_TICKS_RUN1) {
    scene.advanceTime(TUNING.stepMs, (upcomingTick) => scriptedInput(upcomingTick));
    if (want1.has(scene.tick)) {
      records.push({ phase: 'run1', tick: scene.tick, snapshot: scene.renderGameToText() });
    }
    if (scene.tick >= max1 && !scene.gameOver) {
      // Keep stepping past the last fixed checkpoint until the crash lands.
      continue;
    }
  }
  records.push({
    phase: 'crash',
    tick: scene.tick,
    snapshot: scene.renderGameToText(),
    gameOver: scene.gameOver,
    gameOverAt: scene.gameOverAt,
  });

  scene.restartGame();
  records.push({ phase: 'restart', tick: scene.tick, snapshot: scene.renderGameToText() });

  const want2 = new Set(CHECKPOINTS_RUN2);
  const max2 = Math.max(...CHECKPOINTS_RUN2);
  while (scene.tick < max2) {
    scene.advanceTime(TUNING.stepMs, (upcomingTick) => scriptedInput(upcomingTick));
    if (want2.has(scene.tick)) {
      records.push({ phase: 'run2', tick: scene.tick, snapshot: scene.renderGameToText() });
    }
  }
  return records;
}
