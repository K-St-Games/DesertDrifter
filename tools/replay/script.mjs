// WP-B6: scripted replay definition.
//
// One seed plus one deterministic input script. The script is a function of
// the upcoming tick returning the per-step input object consumed by
// GameScene.step()/advanceTime(), so it works identically through update()
// frames and through advanceTime(ms, fn). Early steering taps exercise the
// steer path; afterwards the car holds centre so the UFO beam is guaranteed
// to connect on its first firing step (the UFO locks onto the car's
// position, and a stationary car is still under the beam when it fires).
//
// With SEED below the run passes through: obstacle spawning/scoring,
// the UFO approach -> lock -> charge (warning beam) -> fire (deadly beam),
// a crash on the first firing step, and a restart. Checkpoints are fixed
// ticks so that any timing change (stepMs, spawn delays, UFO timers) moves
// the run out of phase and fails the comparison.

export const SEED = 'replay-b6';

export function scriptedInput(tick) {
  let steer = 0;
  if (tick >= 100 && tick < 130) steer = 1; // right tap: exercises steer
  else if (tick >= 200 && tick < 230) steer = -1; // left tap: returns to centre
  else if (tick >= 500 && tick < 520) steer = 1; // small nudge mid-run
  return { steer, speedDelta: 0, restart: false, pause: false, mute: false };
}

// Fixed-tick checkpoints in the first run (all mode 'running' except the crash).
export const CHECKPOINTS_RUN1 = [150, 600, 1800, 3000, 3300, 3371];
// The crash lands on the first firing step (mode 'game_over').
export const EXPECTED_CRASH_TICK = 3372;
// Upper bound for the crash hunt; the runner fails if no crash by this tick.
export const MAX_TICKS_RUN1 = 4000;
// Checkpoints after restartGame() (tick restarts at 0, same seed + same
// tick-keyed inputs replay the opening).
export const CHECKPOINTS_RUN2 = [60, 600];
