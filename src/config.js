// Game-wide configuration. Values are unchanged from the original single-file game.js.

export const GAME = { width: 480, height: 640 };

// Lane geometry (x, in game pixels). The car is "off-road" (rough-terrain shake) outside left..right.
// Rocks and turtles spawn on the road, trees in the desert on either side, tumbleweeds anywhere.
// tilePositionX positions the road texture horizontally.
export const ROAD = {
  left: 160,
  right: 320,
  // Centres the asphalt (texture columns 409-614) on x=240; was 260, which sat 11.5 px right of the lane logic.
  tilePositionX: 272,
  treeZones: [[20, 130], [350, 460]],
  anywhere: [50, 430],
};

// Simulation runs at a fixed 60 Hz step regardless of display refresh rate.
// ISSUE-1 (reopened after playtest): the original scrolled `currentSpeed * 2` px
// once per rendered frame, so on a 120 Hz display it ran ~2x as fast as a 60 Hz
// one. The first fix kept the 60 Hz pace and playtesting on a ~120 Hz display
// found it "way too slow", so `scrollFactor` is now 4 (road and obstacles).
// Pace (neutral input): 4 px/step * 60 steps/s = 240 px/s at base speed,
// the same as the original on a 120 Hz display. Spawn delay stays in ms, so
// obstacle spacing scales with the faster scroll exactly as it did originally.
// Sideways velocities, UFO timers and scoring are unchanged.
// Set scrollFactor back to 2 for the original's 60 Hz pace.
// The Arcade world runs on the same clock: GameScene detaches the world's
// render-driven update (ArcadePhysics.disableUpdate, not a World method) and
// calls world.update(0, stepMs) once per step, which advances exactly one
// fixed step at the default world fps of 60. Do not change stepMs without
// re-checking that 1:1 ratio.
// All gameplay timers are counted in steps ("ticks": 1 tick = 1 step).
// WP-B1: ms values were converted once via steps = round(ms / stepMs),
// stepMs = 1000/60, so 1 step ~= 16.67 ms. Integer-tick timing differs from
// the old float-ms timing by at most 1 step per delay.
export const TUNING = {
  stepMs: 1000 / 60,
  maxFrameMs: 100, // clamp long frames (tab switches) so the sim never spirals
  baseSpeed: 1,
  speedIncrement: 0.0001, // per step; base speed creeps up during a run
  maxBaseSpeed: 1.8, // stays below the x2 multiplier threshold (2)
  restartLockoutSteps: 30, // was restartLockoutMs: 500 (500 / stepMs ~= 30)
  firstSpawnDelaySteps: 120, // was firstSpawnDelayMs: 2000 (2000 / stepMs = 120)
  // WP-C3: effective-speed clamp and scoring, moved verbatim from GameScene.step().
  minSpeed: 0.5, // floor for base + boost/brake (speed units)
  maxSpeed: 3, // ceiling for base + boost/brake (speed units)
  multiplierThreshold: 2, // currentSpeed >= this doubles pass-by points (speed units)
  scrollFactor: 4, // px per step per speed unit; road and obstacles advance together (4 = the original on a 120 Hz display; 2 = original on 60 Hz)
};

// WP-C3: obstacle spawn pacing and travel, moved verbatim from SpawnSystem
// (no balance changes). Delay math stays in ms, converted once to integer
// steps via round(ms / stepMs) at each scheduling point.
export const SPAWN = {
  baseDelayMs: 1500, // base spawn delay numerator (ms)
  speedFactor: 0.8, // delayMs = baseDelayMs / (currentSpeed * speedFactor)
  jitterMs: 100, // uniform +/- jitter drawn from the gameplay RNG (ms)
  minDelayMs: 300, // floor for the delay before ms->steps conversion (ms)
  spawnY: -50, // obstacle spawn height, just above the screen (px)
  despawnY: 700, // score-and-destroy line, just below the screen (px)
};

// WP-C3: player car tuning, moved verbatim from GameScene.step()/create().
export const CAR = {
  speed: 200, // Arcade velocityX while steering (px/s, integrated once per step)
  tiltDeg: 5, // visual bank angle while steering (deg)
  startX: 240, // run-start (and restart) position (px)
  startY: 400, // run-start (and restart) position (px)
};

// WP-C3: trailer follow tuning, moved verbatim from GameScene.step()/create().
export const TRAILER = {
  startX: 240, // run-start (and restart) position (px)
  startY: 500, // run-start (and restart) position (px)
  followOffsetY: 120, // target rests this far behind the car (px)
  lerp: 0.08, // per-step follow factor toward (car.x, car.y + followOffsetY)
  swayFactor: 0.30, // lateral sway from the car-trailer gap (fraction)
  swayMultiplier: 3, // trailer angle = gap * swayFactor * swayMultiplier (deg scale)
};

// WP-C3: boost/brake amounts and touch zones, moved verbatim from Controls.
export const CONTROLS = {
  boost: 4, // added to base speed while Up/W or the top touch zone is held (speed units)
  brake: 0.5, // subtracted from base speed while Down/S or the bottom zone is held (speed units)
  boostZoneY: 320, // pointer.y < this = boost (px)
  brakeZoneY: 500, // pointer.y > this = brake (px)
  steerSplitX: 240, // pointer.x < this steers left, else right (px)
};

// UFO boss tunables (all timers counted in fixed steps, 60 per second)
// WP-C3: positions in px, lerps per step, thresholds in px, wobble in ms/deg.
export const UFO = {
  scoreThreshold: 2000,
  hovers: 3, // random hover points before locking on
  attacks: 3,
  chargeSteps: 180, // warning beam (3 s)
  fireSteps: 60, // deadly beam (1 s)
  beamHalfWidth: 40, // half-width of the beam hitbox and art (px)
  beamLengthY: 700, // beam drawn down to this y (px)
  beamOriginOffsetY: 20, // beam starts this far below the sprite (px)
  // WP-B1: was respawnMs: [10000, 20000]; steps = round(ms / stepMs).
  respawnSteps: [600, 1200], // 10-20 s; Between() draws integer steps directly
  flickerPeriodSteps: 12, // warning-beam flicker period (was 200 ms)
  flickerOnSteps: 6, // beam visible for the first half-period (was 100 ms)
  targetX: [100, 380], // random hover target range (px)
  targetY: [100, 300], // random hover target range (px)
  approachLerp: 0.02, // per-step approach factor toward hover targets
  lockLerp: 0.05, // per-step approach factor toward the lock point above the car
  approachThresholdPx: 30, // hover target counts as reached within this (px)
  lockThresholdPx: 10, // lock point counts as reached within this (px)
  lockOffsetYPx: 200, // lock point hovers this far above the car (px)
  leaveSpeedPxPerStep: 3, // upward exit speed after the last attack (px/step)
  spawnY: -100, // spawn height at (car.x, spawnY), offscreen (px)
  despawnY: -100, // leaving ends when y < this (px)
  hiddenX: -100, // parking x for the invisible sprite (px)
  wobblePeriodMs: 300, // approach wobble period (ms, driven by tick for determinism)
  wobbleAmplitudeDeg: 5, // approach wobble amplitude (deg)
};

export function createGameConfig(scenes) {
  return {
    type: Phaser.AUTO,
    width: GAME.width,
    height: GAME.height,
    parent: 'game-container',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: 0 },
        debug: false,
      },
    },
    scene: scenes,
    pixelArt: true,
  };
}
