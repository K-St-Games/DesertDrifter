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

## Controls

Arrows or WASD to steer, Up/W to boost (x2 score multiplier at speed), Down/S to brake. Touch: left/right half steers, top boosts, bottom brakes. `M` mutes, `P` pauses, `0` draws hitboxes.

## Layout

| Path | What |
|---|---|
| `src/` | Game code (ES modules): `scenes/`, `systems/` (spawn, UFO), `input/`, `audio/`, `managers/`, `ui/`, `entities.js`, `config.js` |
| `art/source/` | 1024 px original art; `art/palette.hex` is the shared 48-colour palette; `art/sprites.json` lists sprite sizes |
| `assets/` | Runtime assets: generated indexed sprites in `sprites/`, music in `audio/` |
| `tools/` | `build_sprites.py`, `audit_sprites.py` (Pillow, numpy, scipy), `fix_assets.py` |

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
