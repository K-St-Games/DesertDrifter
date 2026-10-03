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
// Owner decision D1 (WP-A3 / ISSUE-1): keep the 60 Hz pace. The original
// scrolled `currentSpeed * 2` px once per rendered frame, so on a 120 Hz
// display it ran ~2x as fast; this build runs the same 60 steps/s everywhere,
// so baseSpeed/speedIncrement are intentionally NOT raised to match that.
// Target pace (neutral input): 2 px/step * 60 steps/s = 120 px/s at base
// speed, creeping with the ramp below to ~142 px/s at t=30 s; the 30 s
// neutral average is ~130.8 px/s (2*sum(1+0.0001*k, k=1..1800) = 3924.2 px).
// By fixed-step design the 60 Hz and 120 Hz+ cadences agree within 2%
// (WP-A0 simulate.mjs: 130.81 vs 130.84 px/s). Verify with
// `node tools/measure/simulate.mjs --cadence {60,120} --seconds 30` plus
// `node tools/measure/summarise.mjs` (WP-A0 harness).
// Difficulty note: SpawnSystem's delay `(1500/(speed*0.8))` tightens as speed
// rises, so a faster base would also spawn obstacles faster; left unchanged
// per D1 (no balance change in WP-A3).
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
};

// UFO boss tunables (all timers counted in fixed steps, 60 per second)
export const UFO = {
  scoreThreshold: 2000,
  hovers: 3, // random hover points before locking on
  attacks: 3,
  chargeSteps: 180, // warning beam (3 s)
  fireSteps: 60, // deadly beam (1 s)
  beamHalfWidth: 40,
  // WP-B1: was respawnMs: [10000, 20000]; steps = round(ms / stepMs).
  respawnSteps: [600, 1200], // 10-20 s; Between() draws integer steps directly
  flickerPeriodSteps: 12, // warning-beam flicker period (was 200 ms)
  flickerOnSteps: 6, // beam visible for the first half-period (was 100 ms)
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
