# WP-A0 measurement harness

Repeatable numbers for road speed and sprite jitter (prerequisite for
WP-A3, WP-A4, WP-B1–B5). No npm dependencies; Node 18+ only
(`run_browser.mjs` uses the built-in `fetch`/`WebSocket`).

## Frame format

One JSON object per rendered frame, produced by the page-side probe
(`GameScene.recordMeasureFrame`, enabled only with `?debug`):

```json
{ "t": 1234, "steps": 1, "roadY": -100.2, "carX": 200.1, "obstacles": [[240, 10.1]] }
```

`t` is the scene clock (ms), `steps` the number of `step()` calls that frame,
`roadY` the road `tilePositionY`, `obstacles` the active obstacles' `[x, y]`.
`window.__measure` is the live buffer, `window.getMeasureBuffer()` returns a
JSON-able copy. The buffer caps at 20000 frames (~5.5 min at 60 fps).

## Browser run (preferred)

```bash
python3 -m http.server 8080          # plain server, NOT Live Server (it reloads on file change)
node tools/measure/run_browser.mjs --url 'http://localhost:8080/?seed=race1&debug' \
  --seconds 30 --out /tmp/opencode/measure_60hz.json --throttle-fps 60
node tools/measure/run_browser.mjs --url 'http://localhost:8080/?seed=race1&debug' \
  --seconds 30 --out /tmp/opencode/measure_120hz.json
node tools/measure/summarise.mjs /tmp/opencode/measure_60hz.json
node tools/measure/summarise.mjs /tmp/opencode/measure_120hz.json
```

Notes:

- Requires a Chromium/Chrome binary (`--chrome <path>` or `CHROME_PATH`).
  Without one the runner exits 2 and tells you to use the fallback below.
- `--throttle-fps 60` emulates a 60 Hz display on a faster machine by
  quantizing `requestAnimationFrame`; omit it for the native (120 Hz+) cadence.
- Same `?seed=` twice must give the same road speed within 1% (acceptance check).

## Node-only fallback (no browser)

`simulate.mjs` replicates the exact road/obstacle step math
(`road.tilePositionY -= currentSpeed * 2`, `speed += 0.0001/step` capped at 1.8)
with neutral input through the same accumulator, at any frame cadence:

```bash
node tools/measure/simulate.mjs --cadence 60 --seconds 30 --out /tmp/opencode/measure_60hz.json
node tools/measure/simulate.mjs --cadence 120 --seconds 30 --out /tmp/opencode/measure_120hz.json
node tools/measure/summarise.mjs /tmp/opencode/measure_60hz.json
```

## Baseline (current build, 2026-10-03)

From `simulate.mjs`, 30 s, neutral input (no boost/brake). Analytic check:
2·Σ(1+0.0001·k) over 1800 steps = 3924.2 px → 130.8 px/s; instantaneous rate
rises from 120 px/s (t=0) to ~142 px/s (t=30 s) as base speed creeps 1.0→1.18.

| Cadence | Road px/s | Steps/frame | Road px/frame (mean ± sd) | Sprite outside 0.5x–1.5x band |
|---|---|---|---|---|
| 60 Hz | 130.81 | always 1 | 2.18 ± 0.11 | 0/1680 |
| 120 Hz | 130.84 | alternates 0/1 | 1.09 ± 1.09 | 0/3358 |

Road speed matches within 0.1% across cadences (fixed-step accumulator works),
but at 120 Hz the rendered scroll alternates 0 / ~2.2 px per frame — the uneven
motion WP-A4 must smooth. Browser-measured numbers (with spawns, UFO, input)
still to be recorded here once a Chromium is available; the scripts above are
ready (`run_browser.mjs` exits 2 in environments without a browser).
