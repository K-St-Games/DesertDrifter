# Desert Drifter

Arcade desert-road game (Phaser 3.90) — drive, dodge, survive the UFO.

Forked from [thomasmeston/DesertDrifter](https://github.com/thomasmeston/DesertDrifter) (the upstream author's live build is at <https://thomasmeston.github.io/DesertDrifter/>). This fork has been modernized and stabilized; see [PLAN.md](PLAN.md).

## Status (paused 2026-10-05)

- Phases 1–2 and the standards-alignment work are landed on `main` (PRs #9–#24). A post-playtest speed fix (`TUNING.scrollFactor` 2 → 4) is PR #25.
- `main` is verified green: `npm test` (54 tests), `node tools/replay/check.mjs`, `python3 tools/audit_sprites.py`, `node tools/validate_entities.mjs`.
- One open issue: [ISSUE-5](ISSUES.md), the 23 MB music file decodes to about 290 MB in memory (deferred performance opportunity; the file is unchanged on purpose).
- No live site yet (Pages not enabled). To resume, in order: enable Pages and live-URL check → phone test (BGM startup/memory, PLAN WP1.9) → hitbox playtest log (WP2.7) → tag `v1.0.0` (WP4.5, needs the `?v=` cache-bust first).

## Docs

| Doc | What |
|---|---|
| [PLAN.md](PLAN.md) | The active enhancement plan: architecture decisions, work-package status, release gates, deferred Phase 3 content |
| [ISSUES.md](ISSUES.md) | Issue tracker: open items first, closed items with the PR that fixed them |
| [tools/replay/README.md](tools/replay/README.md) | The seeded replay regression check |
| [tools/measure/README.md](tools/measure/README.md) | The speed and jitter measurement harness |
| [docs/archive/](docs/archive/) | Completed plans kept for the record (the standards-alignment plan) |

## Run locally

Serve the folder over HTTP (ES modules do not load from `file://`):

```bash
python3 -m http.server 8080
```

Open <http://localhost:8080/>. Add `?debug` to expose `window.game` in the console, `?seed=<text>` for repeatable randomness.

With `?debug`, two extra hooks exist for replay checks: `window.advanceTime(ms, input)` runs exactly `round(ms / stepMs)` gameplay steps (60 per 1000 ms) with real-time updates suspended — `input` is one per-step input object reused every step, or a function `(upcomingTick, stepIndex) => input` for scripted runs (default: neutral). `window.render_game_to_text()` returns the sim snapshot as JSON: `mode`, `tick` (steps), `paused`, `seed`, `rngState`, spawn countdown (`nextSpawnTick`, `spawnInTicks`), `score`, `speed`, `car`/`trailer`/`ufo`/`obstacles` positions in px, and UFO timers in steps. Two runs with the same seed and the same scripted inputs produce identical snapshots.

The repo pins one such run as a regression test: `node tools/replay/check.mjs` replays a seeded script (spawning, UFO warning+fire, crash, restart) headlessly and compares 8 snapshots against `tools/replay/golden.json` — see [tools/replay/README.md](tools/replay/README.md). Regenerate goldens only after an intentional gameplay change: `node tools/replay/check.mjs --regenerate`.

## Controls

Arrows or WASD to steer, Up/W to boost (x2 score multiplier at speed), Down/S to brake. Touch: left/right half steers, top boosts, bottom brakes. `M` mutes, `P` pauses, `0` draws hitboxes.

## Game speed (ISSUE-1)

Target pace matches the original on a 120 Hz display (changed after playtesting): the road scrolls `currentSpeed * TUNING.scrollFactor` (4) px per fixed 60 Hz step, i.e. 240 px/s at base speed, ~262 px/s averaged over a 30 s neutral run. Identical on 60 Hz and 120 Hz+ displays by fixed-step design. Set `scrollFactor` to 2 for the original's 60 Hz pace. Verify with the WP-A0 harness (`tools/measure/`): `node tools/measure/simulate.mjs --cadence {60,120} --seconds 30` then `node tools/measure/summarise.mjs` on each output (or `run_browser.mjs` for live browser numbers).

## Layout

| Path | What |
|---|---|
| `src/` | Game code (ES modules): `scenes/`, `systems/` (spawn, UFO), `factory/`, `input/`, `audio/`, `managers/`, `ui/`, `sim/` (seeded gameplay RNG), `debug/` (hitbox overlay), `entities.js`, `behaviors.js`, `config.js` |
| `art/source/` | 1024 px original art; `art/palette.hex` is the shared 48-colour palette; `art/sprites.json` lists sprite sizes |
| `assets/` | Runtime assets: generated indexed sprites in `sprites/`, music in `audio/` |
| `tests/` | `node --test` suites (`npm test`); they stub Phaser, so confirm input, physics or rendering changes in a real browser too |
| `tools/` | `build_sprites.py`, `audit_sprites.py` (Pillow, numpy, scipy), `fix_assets.py`, `replay/` (seeded replay check, plain Node), `measure/` (speed/jitter harness), `smoke_boot.mjs` (headless-Chromium boot smoke, needs `CHROME_PATH`), `validate_entities.mjs` (entity-table check) |
| `package.json` | ESM marker + `npm` scripts (`test`, `test:replay`, `audit`, `validate`). No build, bundler, or dependencies. |

## Measure speed and jitter (WP-A0)

```bash
python3 -m http.server 8080
node tools/measure/run_browser.mjs --url 'http://localhost:8080/?seed=race1&debug' --seconds 30 --out /tmp/opencode/measure_60hz.json --throttle-fps 60
node tools/measure/summarise.mjs /tmp/opencode/measure_60hz.json
```

No browser available? Use the deterministic fallback: `node tools/measure/simulate.mjs --cadence 60 --seconds 30 --out /tmp/opencode/measure_60hz.json`.
Details and baseline numbers: [tools/measure/README.md](tools/measure/README.md).

## Add an obstacle

1. Put a 1024 px PNG with a transparent background in `art/source/<id>.png` and its on-screen size in `art/sprites.json`.
2. Run `python3 tools/build_sprites.py && python3 tools/audit_sprites.py`.
3. Add a row to `src/entities.js` (points, `spawnWeight`, `spawnZone`, hitbox, optional `behavior`; new behaviors go in `src/behaviors.js`). A weight of 0 keeps it out of the game.
