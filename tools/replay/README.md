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
| `run1` @ 3000 | 2914+ | UFO active, `approaching` (score crossed 2000) |
| `run1` @ 3300 | 3190+ | UFO `charging` (yellow warning beam, timer 110/180) |
| `run1` @ 3371 | 3371 | UFO `firing` (green beam, still running) |
| `crash` @ 3372 | 3372 | first firing step crashes the car (`game_over`) |
| `restart` @ 0 | — | `restartGame()`: clock, score, RNG stream and spawner reset |
| `run2` @ 60, 600 | 1–600 | post-restart run replays the opening identically |

The harness ([`harness.mjs`](harness.mjs)) builds the real `GameScene`
with its real spawn/UFO/RNG systems and stubbed rendering/audio, drives it
through the shipped `advanceTime()` API one step at a time, and reads the
shipped `renderGameToText()` snapshots — the same APIs the `?debug`
browser hooks use. No gameplay code is changed or wrapped.

## Run the check

```bash
node tools/replay/check.mjs
```

Exit code is 0 when all 10 checkpoints are byte-identical (`REPLAY CHECK
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

Verified on this branch by temporarily mutating gameplay constants and
re-running the check (mutations reverted afterwards):

- `tumbleweed` `spawnWeight` 35 → 1 (`src/entities.js`): check fails —
  `rngState` differs from tick 150 on, scores diverge, and the crash moves
  from tick 3372 to 2773 (checkpoint count 10 vs 7, exit 1).
- `TUNING.stepMs` 1000/60 → 1000/59 (`src/config.js`): check fails — car
  positions, `nextSpawnTick` countdowns and the crash tick (3372 → 3333)
  all shift (exit 1).

Both mutations are caught at the first affected checkpoint, so the check
guards spawn balance and step timing as required.
