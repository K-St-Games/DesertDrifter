# Desert Drifter

Arcade desert-road game (Phaser 3.90) — drive, dodge, survive the UFO.

Forked from [thomasmeston/DesertDrifter](https://github.com/thomasmeston/DesertDrifter) (the upstream author's live build is at <https://thomasmeston.github.io/DesertDrifter/>). This fork is being modernized; see [PLAN.md](PLAN.md).

## Roadmap

- [ISSUES.md](ISSUES.md): open bugs and improvements.
- [STANDARDS_ALIGNMENT_PLAN.md](STANDARDS_ALIGNMENT_PLAN.md): the proposed work plan (stability fixes, one gameplay clock and RNG, small safeguards). It is a proposal; accepted architecture choices remain in [PLAN.md](PLAN.md).

## Run locally

Serve the folder over HTTP (ES modules do not load from `file://`):

```bash
python3 -m http.server 8080
```

Open <http://localhost:8080/>. Add `?debug` to expose `window.game` in the console, `?seed=<text>` for repeatable randomness.

With `?debug`, two extra hooks exist for replay checks: `window.advanceTime(ms, input)` runs exactly `round(ms / stepMs)` gameplay steps (60 per 1000 ms) with real-time updates suspended — `input` is one per-step input object reused every step, or a function `(upcomingTick, stepIndex) => input` for scripted runs (default: neutral). `window.render_game_to_text()` returns the sim snapshot as JSON: `mode`, `tick` (steps), `paused`, `seed`, `rngState`, spawn countdown (`nextSpawnTick`, `spawnInTicks`), `score`, `speed`, `car`/`trailer`/`ufo`/`obstacles` positions in px, and UFO timers in steps. Two runs with the same seed and the same scripted inputs produce identical snapshots.

## Controls

Arrows or WASD to steer, Up/W to boost (x2 score multiplier at speed), Down/S to brake. Touch: left/right half steers, top boosts, bottom brakes. `M` mutes, `P` pauses, `0` draws hitboxes.

## Layout

| Path | What |
|---|---|
| `src/` | Game code (ES modules): `scenes/`, `systems/` (spawn, UFO), `input/`, `audio/`, `managers/`, `ui/`, `entities.js`, `config.js` |
| `art/source/` | 1024 px original art; `art/palette.hex` is the shared 48-colour palette; `art/sprites.json` lists sprite sizes |
| `assets/` | Runtime assets: generated indexed sprites in `sprites/`, music in `audio/` |
| `tools/` | `build_sprites.py`, `audit_sprites.py` (Pillow, numpy, scipy), `fix_assets.py` |

## Add an obstacle

1. Put a 1024 px PNG with a transparent background in `art/source/<id>.png` and its on-screen size in `art/sprites.json`.
2. Run `python3 tools/build_sprites.py && python3 tools/audit_sprites.py`.
3. Add a row to `src/entities.js` (points, `spawnWeight`, `spawnZone`, hitbox, optional `behavior`; new behaviors go in `src/behaviors.js`). A weight of 0 keeps it out of the game.
