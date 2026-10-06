# Replay check (WP-B6)

Deterministic regression net for gameplay: a scripted run is replayed
headlessly in Node and its snapshots are compared against a golden file.
Any change to spawn weights, step timing, UFO timers or RNG draw order
moves the snapshots and fails the check.

## What the run covers

Seed `replay-b6` with the input script in [`script.mjs`](script.mjs)
(early steering taps, then a held centre so the UFO beam connects):

| Phase | Ticks | What is exercised |
|---|---|---|
| `run1` @ 150, 600, 1800 | 1–1800 | obstacle spawning, pass-by scoring, RNG stream |
| `run1` @ 2800 | 2800 | UFO active and `charging` (score 2350, past the 2000 threshold; yellow warning beam, timer 64/180) |
| `crash` @ 2918 | 2918 | first firing step crashes the car (`game_over`, UFO `firing`) |
| `restart` @ 0 | — | `restartGame()`: clock, score, RNG stream and spawner reset |
| `run2` @ 60, 600 | 1–600 | post-restart run replays the opening identically |

Checkpoints must fall before the crash tick (see `script.mjs`); one placed after it is never reached.

The harness ([`harness.mjs`](harness.mjs)) builds the real `GameScene`
with its real spawn/UFO/RNG systems and stubbed rendering/audio, drives it
through the shipped `advanceTime()` API one step at a time, and reads the
shipped `renderGameToText()` snapshots — the same APIs the `?debug`
browser hooks use. No gameplay code is changed or wrapped. The fake world integrates velocities;
it does not implement Phaser obstacle overlaps or world-bound hitbox geometry.
This fixture covers spawn/scoring/RNG and the UFO beam crash; browser checks
must cover actual obstacle collisions and world bounds separately.

The review correction moves terrain offsets into the gameplay RNG because
those offsets change physics positions. This intentionally changes the seeded
trajectory, subsequent random draws and the crash from tick 3372 to 2996.
The golden snapshots were updated for that diagnosed change.

Doubling `TUNING.scrollFactor` (2 -> 4, the post-playtest speed fix) moves the
scroll, so the golden was regenerated and the crash moved from tick 2996 to 2918.

## Run the check

```bash
node tools/replay/check.mjs
```

Exit code is 0 when all 8 checkpoints are byte-identical (`REPLAY CHECK
PASSED`), 1 on any mismatch (`REPLAY CHECK FAILED` with the first differing
field per checkpoint). Plain Node, no dependencies; nothing in this folder
is imported by the game, so it can never become a runtime dependency.

## Regenerate the golden file

Only after an *intentional* gameplay change (new balance, retuned timers):

```bash
node tools/replay/check.mjs --regenerate
```

This rewrites [`golden.json`](golden.json) from the current run. Review the
diff: every changed snapshot must be explained by the intended change.
Never regenerate to silence a failure you do not understand.

## Sensitivity (deliberate-fail proof)

Verified by mutating copies of the reviewed checkout (then restoring them):

- `tumbleweed.spawnWeight` 35 → 1: the replay fails with RNG/position/score changes.
- `TUNING.stepMs` 1000/60 → 1000/59: the replay fails with timing and position changes.

Both return exit 1 against the reviewed golden. Removing `world.postUpdate()`
also changes integrated positions; the regression suite checks that the car
moves with its physics body.
