---
title: "Desert Drifter — Enhancement Plan"
description: "Phased plan to modernize the Desert Drifter fork by porting proven parts of HiOrbit_game and HiOrbit_redux, fixing foundation issues, and rebuilding the art on a shared palette. New content is deferred."
status: active
status_detail: "Phase 1 in progress (PR1: module split, Phaser pin); Phase 3 (new content) deferred by decision; shared palette locked in WP1.8"
owner: "K_St_Games Team"
last_updated: 2026-09-30
kind: plan
---

# Desert Drifter — Enhancement Plan

Paths starting with `HiOrbit_game/` or `HiOrbit_redux/` refer to sibling repos in the K_St_Games workspace; they are not part of this repo. Numbers in this plan come from a code and asset audit (2026-09-29) and a palette prototype (2026-09-30); see Appendix A.

## 1. Summary

Desert Drifter is a 706-line, single-file Phaser 3 arcade game: drive a truck and trailer down a desert road, dodge obstacles, survive a UFO. This fork is the original prototype. Two later rebuilds (`HiOrbit_game`, `HiOrbit_redux`) put most of their effort into tooling (redux alone has about 1,560 lines of entity-editor code and about 260 lines of loader/factory plumbing) and between them added one new entity, the armadillo.

This plan does the opposite. It keeps this fork's no-build GitHub Pages hosting, ports the small set of proven pieces from redux, fixes the foundation problems found in the audit, and rebuilds the art on one shared colour palette. New obstacles and powerups are deferred by decision (2026-09-30); the data-driven core is built so adding them later is cheap.

| Phase | Outcome | Starts when |
|---|---|---|
| 0. Baseline | Rollback tag, baseline capture, reproducible sprite audit | now |
| 1. Foundation | Same game, split into modules, correct on any display, audio works, art rebuilt on a shared palette (art payload from about 4.2 MB to under 100 KB) | Phase 0 |
| 2. Port and data-driven core | Adding a static obstacle is a sprite plus one table row | Phase 1 |
| 3. Content | Deferred by decision (2026-09-30); backlog kept in section 8 | Not scheduled |
| 4. Polish and release | Feedback, UX, docs, `v1.0.0` | Phase 2 |

## 2. Goals and non-goals

**Goals**

- G1. Playable parity first, then better: same speed on every display, working audio, a difficulty ramp.
- G2. A content model where a new obstacle needs a sprite and a table row (plus an optional behavior function), with no edits to the core loop.
- G3. Deferred by decision (2026-09-30): new obstacles and powerups. The backlog is kept in section 8.
- G4. Lean and mobile-friendly: touch controls kept, a tiny art payload, quick start (the music loads after the game starts).
- G5. `main` stays deployable on GitHub Pages at every step.
- G6. A cohesive look: all art shares one locked palette (D7).

**Non-goals**

- No bundler or TypeScript (revisit triggers in D1).
- No manifest/registry loader, editor server or UI, EntityManager/gdm publishing, or Phaser Editor 2D project.
- No Phaser 4 migration. No shared `@kst/*` packages (workspace rule: contract first, kernel later).
- No backend. High scores stay in `localStorage`. No online leaderboard.
- No new obstacles or powerups for now, and no change to the music file (decisions of 2026-09-30).

## 3. Baseline

State at `main` @ `d1b6fe4`: the original tip `b9b3e5d` with `HiOrbit_Game.zip` purged from history on 2026-09-30 (O4). The original history stays in `refs/original/refs/heads/main` and on `origin` until the rewrite is force-pushed.

- **Runtime:** [game.js](game.js) (706 lines, about 30 module-level globals) plus [index.html](index.html). Phaser 3.55.2 from jsDelivr. GitHub Pages serves `main` (`.nojekyll`). Remote: `K-St-Games/DesertDrifter`.
- **Gameplay:** 480×640 canvas; truck with a towed trailer (lerp-follow and sway); tumbleweed, rock, tree, turtle; UFO boss (approach, lock, charge, fire, three attacks); x2 multiplier at speed 2 or more; local top-10 with initials.
- **Controls:** arrows/WASD; touch (left/right half steers, top half boosts, bottom brakes); fullscreen button.
- **Payload:** the player downloads about 27 MB before `create()` runs (23 MB music, 4.2 MB sprites). The music is 12:41 at 250 kbps and decodes to about 270 MB of PCM in memory (761 s × 44.1 kHz × 2 ch × 4 B). Object sprites are 1024×1024 shown at 5–15% scale. The repo also tracked a 28 MB `HiOrbit_Game.zip` (`.git` was 34 MB); it was purged from history on 2026-09-30.

### Known issues

"Unverified" means the cause is clear from the code but the symptom has not been reproduced.

| # | Issue | Evidence | Impact | Fixed in |
|---|---|---|---|---|
| 1 | Movement is per-frame, not time-based | [game.js:281](game.js#L281), [game.js:469](game.js#L469) | Likely about 2x speed on 120/144 Hz displays (unverified) | WP1.3 |
| 2 | `AudioContext` created before any user gesture and never resumed | [game.js:91](game.js#L91) | Engine/UFO synth may be silent in browsers that suspend it (unverified) | WP1.4 |
| 3 | Start is gated on the 23 MB music download and decode | `preload()` loads `bgm` | Slow start; the ~270 MB decode may crash low-memory phones (unverified) | WP1.4, WP1.9 |
| 4 | No difficulty ramp | [game.js:35](game.js#L35) `speed = 1` | Flat difficulty | WP1.5 |
| 5 | Road art is off-centre from gameplay constants | Appendix A.4 | Right 34 px of asphalt counts as "rough"; lane spawns are lopsided | WP1.6 |
| 6 | Turtle/tumbleweed circle hitboxes anchored to the frame's top-left | [game.js:539](game.js#L539), [game.js:542](game.js#L542) (`setCircle`, no offset) | Hits register up-left of the art | WP2.2 |
| 7 | Touch restart fires immediately at game over | [game.js:221](game.js#L221) | Finger still down means an instant accidental restart | WP1.10 |
| 8 | `JSON.parse` of saved scores is unguarded | [game.js:86](game.js#L86) | Corrupt storage stops the game from starting | WP2.3 |
| 9 | Crash handler has no re-entry guard | [game.js:565](game.js#L565) | Car and trailer can both trigger it in one physics step (double crash sound/form) | WP1.5 |
| 10 | README "Play" link points at `thomasmeston.github.io` | [README.md](README.md) | Points at the original author's deployment, not this fork | WP1.11 |

## 4. What to port and what to skip

| Item | Source | Decision | Notes |
|---|---|---|---|
| Fixed-step simulation, `advanceTime`, `render_game_to_text` hooks | `HiOrbit_redux/src/scenes/GameScene.ts` | Port | Fixes issue 1; makes runs testable |
| `AudioManager` | `HiOrbit_redux/src/audio/AudioManager.ts` | Port and extend | Add resume-on-gesture, single reused `AudioContext`, mute |
| `HighScoreManager` | `HiOrbit_redux/src/managers/HighScoreManager.ts` | Port persistence only | Keep this fork's DOM initials form (redux regressed to `window.prompt`) |
| Weighted spawn pool | `GameScene.ts` (`getWeightedObstacleType`, `buildObstacleSpawnPool`) | Port | Opt-in by positive `spawnWeight` |
| Entity factory and `collision` block | `HiOrbit_redux/src/factory/EntityFactory.ts` | Port | Fix tree centre; see Appendix A.3 |
| Tuning knobs | `HiOrbit_redux/content/config/game.json` | Port as `config.js` | `spawnDelayBase`, `speedIncrement`, `ufoScoreThreshold`, `speedMultiplierThreshold` |
| Collision debug overlay (key `0`) | `GameScene.ts` (`renderDebugCollisionOverlay`) | Port with fix | Redux draws `body.radius`, which is wrong for scaled circles |
| Native-size sprite set | `HiOrbit_redux/content/assets/sprites/` | Superseded | Sprites are rebuilt from the 1024 px originals through the palette pipeline (WP1.7, WP1.8). For tree, tumbleweed, turtle and UFO the native set is an exact nearest-neighbour sample of the originals, so it holds no extra information (Appendix A.6) |
| Armadillo sprite | `HiOrbit_redux/content/assets/sprites/armadillo.png` | Use as the source | Exists only at 64×65; baked to 38×38. Enters the entity table at spawn weight 0 (WP2.8) |
| Touch controls, fullscreen button, DOM initials form, Pages hosting | this fork | Keep | Redux and `HiOrbit_game` dropped or deferred these |
| Manifest/registry loader, schema versioning | `HiOrbit_redux/src/loaders/ContentLoader.ts` | Skip | Eight entities do not need it |
| Entity editor server, UI, smoke test | `HiOrbit_redux/tools/` | Skip | About 1,560 lines for zero gameplay |
| EntityManager/gdm contract, Phaser Editor 2D plan, Vite/TS stack | `HiOrbit_game`, `HiOrbit_redux` | Skip | Both repos actually run Phaser 3.90.0 (lockfiles), so there is no engine migration to port |
| `scene.restart()`-based restart | redux | Skip | In-place `resetRun()` is simpler and keeps audio alive |

## 5. Architecture decisions

**D1. No build step: Phaser 3 from CDN plus native ES modules. (Accepted)**
Pages already works, and redux's TypeScript ports to plain JS by deleting type annotations. Alternative: Vite + TypeScript, as in redux. Revisit if any of these happen: more than about 15 modules, a need for type checking, tests that require bundling, or a Phaser upgrade that needs a bundler. Note: modules do not load from `file://`; the README's local-server instruction stays.

**D2. Gameplay first; entities are an ES-module table, not manifest/registry JSON. (Accepted)**
`src/entities.js` is the single source of truth for sprite, scale, points, spawn rules and hitbox. Field names mirror redux's entity JSON `collision` block so definitions copy across. Any tooling PR needs a gameplay justification.

**D3. Pin Phaser 3.90.0. (Accepted)**
It is the version the redux code was built and verified against (both redux and `HiOrbit_game` lockfiles resolve to it), and it is the last Phaser 3 line. Later 3.x upgrades are a separate change.

**D4. Fixed 60 Hz simulation step. (Proposed)**
All motion and timers advance per step; rendering stays at display rate. Tuning constants carry over unchanged so the feel matches the baseline (WP0.3).

**D5. Keep the DOM initials form. (Proposed)**
`window.prompt` blocks the main thread and is ugly on mobile.

**D6. Hitboxes are tuned by overlay and playtest, not inherited. (Proposed)**
Redux's ratios drifted difficulty relative to the fork (Appendix A.3). Targets are in WP2.7.

**D7. All art shares one locked palette. (Accepted as an attempt, with a fallback)**
Decided 2026-09-30. Sprites are rebuilt from the 1024 px originals, baked to their on-screen size (entity scale 1.0), quantized to one shared palette, and stored as indexed PNGs. A prototype (Appendix A.7) shows about 48 colours is a good starting point. The final palette is hand-reviewed and locked in WP1.8. Fallback if the result is not approved: ship the re-baked sprites without quantization.

**D8. The music file stays as is. (Accepted)**
Decided 2026-09-30. The BGM loads after the game starts so it never blocks play. WP1.9 measures start time and memory on a real phone; HTML5-audio streaming (a code-only change) is the contingency if it fails.

## 6. Target architecture

```
DesertDrifter/
├── index.html                  # shell + initials form; loads Phaser (pinned), then src/main.js as a module
├── PLAN.md
├── README.md
├── art/
│   ├── source/                 # 1024 px originals (moved from assets/; tracked)
│   ├── palette.hex             # the locked shared palette (plus .gpl for editors)
│   └── sprites.json            # on-screen frame size per sprite
├── assets/
│   ├── audio/                  # bgm, unchanged (D8)
│   └── sprites/                # generated indexed PNGs at on-screen size; do not hand-edit
├── src/
│   ├── main.js                 # Phaser.Game bootstrap
│   ├── config.js               # canvas, physics, tuning knobs, ROAD bounds
│   ├── entities.js             # entity table (below)
│   ├── behaviors.js            # behavior functions by id (tumble, crawl, ...)   [Phase 2-3]
│   ├── effects.js              # timed powerup effects + HUD chips                [Phase 3]
│   ├── scenes/{PreloadScene,GameScene}.js
│   ├── systems/{SpawnSystem,UfoSystem}.js
│   ├── factory/EntityFactory.js
│   ├── input/Controls.js       # keyboard + touch behind one API
│   ├── audio/AudioManager.js
│   ├── managers/HighScoreManager.js
│   └── debug/CollisionDebug.js
└── tools/
    ├── build_sprites.py        # bake, quantize to the palette, write indexed PNGs (Pillow, numpy, scikit-learn, scipy)
    ├── audit_sprites.py        # verifies the output (Appendix A and B checks)
    └── fix_assets.py           # moved from repo root (rembg background removal)
```

Entity table shape:

```js
// src/entities.js — single source of truth for sprite, size, scoring, spawning, hitbox
export const ENTITIES = {
  rock: {
    category: 'obstacle',
    sprite: 'assets/sprites/rock.png',
    scale: 1,                         // sprites are baked at on-screen size (D7)
    points: 100,
    spawnWeight: 30,                  // absent or 0 means never spawns randomly
    spawnZone: 'road',                // 'road' | 'desert' | 'any'
    collision: { shape: 'box', widthRatio: 0.7, heightRatio: 0.6, centerXRatio: 0.5, centerYRatio: 0.5 },
  },
  tumbleweed: {
    category: 'obstacle',
    sprite: 'assets/sprites/tumbleweed.png',
    scale: 1, points: 50, spawnWeight: 35, spawnZone: 'any',
    collision: { shape: 'circle', radiusRatio: 0.175, centerXRatio: 0.5, centerYRatio: 0.5 },
    behavior: { id: 'tumble', vxMin: 30, vxMax: 80, spin: 200 },
  },
};
```

Rules: systems never branch on entity id (they read the table); every tunable lives in `config.js` or `entities.js`; no module-level mutable globals.

## 7. Roadmap

Size key: **S** up to half a day, **M** about a day, **L** two to three days, including verification. Status: ☐ open, ☑ done, ⏸ deferred. One branch and PR per group; `main` stays playable.

### Phase 0. Baseline and guardrails

| ID | Work package | Size | Acceptance | Status |
|---|---|---|---|---|
| WP0.1 | Tag `v0-prototype` at `d1b6fe4` (the purged original tip) | S | Tag exists; it is pushed together with the history rewrite | ☑ local, push pending |
| WP0.2 | Adopt the branch/PR flow above | S | First PR merged via the flow | ☑ branch `refactor/es-modules` |
| WP0.3 | Capture baseline: 60 s play recording plus notes on speed, spawn cadence, UFO timing | S | Numbers recorded in the PR for WP1.3 | ☐ |
| WP0.4 | Add `tools/audit_sprites.py` reproducing Appendix A; it also checks palette membership once WP1.8 lands | S | Script output matches Appendix A tables | ☐ |

### Phase 1. Foundation

**Group PR1: structure, no behavior change**

| ID | Work package | Size | Acceptance | Status |
|---|---|---|---|---|
| WP1.1 | Split `game.js` into the modules in section 6; bind form handlers in JS instead of `window.*` | M | A/B against `v0-prototype` shows no gameplay difference; no console errors | ☐ |
| WP1.2 | Pin Phaser 3.90.0; verify TileSprite scroll, text styles (`fill` vs `color`), overlaps, pointer input | S | Section 10 checklist passes | ☐ |

**Group PR2: correctness**

| ID | Work package | Size | Acceptance | Status |
|---|---|---|---|---|
| WP1.3 | Fixed 60 Hz step (port from redux `stepSimulation`); per-frame constants become per-step | M | `advanceTime(5000)` gives identical obstacle displacement at 60/120/144 Hz; feel matches WP0.3 | ☐ |
| WP1.4 | Audio: one `AudioContext`, created lazily and resumed on first input; `AudioManager` port; `M` mutes; load BGM after game start | M | Engine audible after first input on Chrome, Safari and iOS Safari; game playable before BGM finishes loading | ☐ |
| WP1.5 | Difficulty ramp (`speedIncrement`, capped); single `resetRun()`; re-entry guard on crash handling | S | No leaked speed, UFO or obstacles across restarts; one crash sound per crash | ☐ |
| WP1.6 | Centre road art on the lanes (`tilePositionX` 272 by measurement, Appendix A.4); move lane constants (`ROAD` bounds, off-road shake, spawn zones, tree zones) into `config.js` | S | Car shows equal margin at both edges; shake starts when the car body leaves the asphalt | ☐ |

**Group PR3: art pipeline and hygiene**

| ID | Work package | Size | Acceptance | Status |
|---|---|---|---|---|
| WP1.7 | Art pipeline: move the 1024 px originals to `art/source/`; add `tools/build_sprites.py` (bake each sprite to its on-screen size by area averaging on premultiplied alpha, threshold alpha at 128, quantize to `art/palette.hex`, write indexed PNGs to `assets/sprites/`, write a before/after sheet); the armadillo is baked from its 64×65 PNG (its only source) with a 2 px margin | M | Same inputs give byte-identical outputs; every sprite and the road load at scale 1.0; art payload under 100 KB | ☐ |
| WP1.8 | Shared palette: turn the prototype candidate (Appendix A.7) into a reviewed, locked `art/palette.hex` (plus `.gpl`); you approve the before/after sheet | S–M | Mean colour shift 3 or less per sprite (OKLab ΔE×100); UFO LEDs (teal, purple, cyan), red tail lights and X mark, car orange trim and trailer teal chevron stay distinct; asphalt keeps at least 20 tones; the audit script fails on any off-palette pixel | ☐ |
| WP1.9 | Music: file unchanged (D8). Measure BGM start time and memory on a real phone; if it stalls or crashes, switch BGM to HTML5-audio streaming (code-only change) | S | Game interactive before the BGM finishes loading; no crash or long stall on a phone | ☐ |
| WP1.10 | Input polish: 500 ms restart lockout after a crash; keyboard/touch restart parity | S | Holding a finger down at crash does not restart | ☐ |
| WP1.11 | Repo hygiene: force-push the purged history (after owner confirmation), then delete `refs/original` and run `git gc`; remove the two small `.bat` scripts, `assets/debug.txt`, `trailer_alt.png` and the 1024 px originals from `assets/` (they move to `art/source/`); move `fix_assets.py` to `tools/`; fix README Play link and add module-serving note | S | `git ls-files` contains only source, `art/`, and shipped assets | ☐ |

**Phase 1 exit:** parity plus fixes; section 10 checklist passes; own art and code (excluding Phaser and the BGM) 500 KB or less; game interactive before the BGM finishes loading; verified on the live Pages URL.

### Phase 2. Port and data-driven core

| ID | Work package | Size | Acceptance | Status |
|---|---|---|---|---|
| WP2.1 | `entities.js` for all current entities (including car, trailer, UFO); preload textures from the table | M | No entity constants remain in scene code | ☐ |
| WP2.2 | `EntityFactory` port: hitboxes from the `collision` block; overlay draws `body.halfWidth`; tree centre Y to 0.75 (verify with overlay) | M | Overlay circles match physics on every circle entity | ☐ |
| WP2.3 | `HighScoreManager` port; DOM initials form; guarded `JSON.parse` | S | Corrupt `highScores` starts a clean game | ☐ |
| WP2.4 | `SpawnSystem`: weighted pool, `spawnZone`, `points` from the table; minimum gap between spawns scaled by speed | M | Over 1,000 spawns, each type lands within 3 points of its weight share | ☐ |
| WP2.5 | Extract UFO into `UfoSystem` (state machine class, step-based timers); tunables in config | M | Identical UFO cycle to baseline | ☐ |
| WP2.6 | Test hooks: overlay (`0`), `render_game_to_text`, `advanceTime`, `?seed=` seeding `Phaser.Math.RND` | S | Same seed and steps produce identical state snapshots | ☐ |
| WP2.7 | Hitbox balance pass using Appendix A.3 (recompute it on the baked sprites). Targets: player boxes about 80–90% of visible art area (fork 76–79%, redux 106–108%); obstacles 75–90% | M | Playtest log: 10 runs, no phantom or missed hits | ☐ |
| WP2.8 | Prove the model: add the armadillo to the table at `spawnWeight: 0`; temporarily raise the weight to confirm it spawns, scores and collides, then leave it at 0 (no new obstacle ships) | S | No engine code touched; the armadillo does not appear in normal play | ☐ |

**Phase 2 exit:** adding a static obstacle is a sprite plus a table row.

### Phase 3. Content (deferred by decision, 2026-09-30)

Nothing in this phase is scheduled. The rows stay so the design work is not lost. Any new sprite must follow the shared palette (D7, Appendix B).

| ID | Work package | Size | Acceptance | Status |
|---|---|---|---|---|
| WP3.0 | Framework: `behaviors.js` registry; `effects.js` (apply, expire, refresh rules, HUD chips); `item` category with collect-overlap; score-tier table; placeholder-texture generator (Phaser `generateTexture`) so mechanics can be built before art exists | M | A pickup and a behavior can be added from the table alone | ⏸ |
| WP3.n | One slice per obstacle or powerup chosen when this phase is revived: sprite (or placeholder), table row, behavior, telegraph, procedural SFX, tuning, section 10 checklist | S–M each | One PR per slice; guardrails in section 9 respected | ⏸ |

### Phase 4. Polish and release

| ID | Work package | Size | Acceptance | Status |
|---|---|---|---|---|
| WP4.1 | Feedback: crash shake and flash, off-road dust, boost speed lines | M | Reviewed in a playtest | ☐ |
| WP4.2 | UX: pause (`P`/`Esc`), persisted mute, how-to-play card, game-over screen | M | Works on desktop and touch | ☐ |
| WP4.3 | Docs: README (run, structure, "add an obstacle" guide), PLAN status update, changelog | S | A new contributor can add an obstacle from the README alone | ☐ |
| WP4.4 | Optional: Playwright smoke using the hooks | M | Only if regressions become a problem | ☐ |
| WP4.5 | Release: tag `v1.0.0`; cache-bust `?v=` on `main.js`; live-URL verification | S | Section 13 checklist passes | ☐ |

## 8. Phase 3 content backlog (deferred)

Deferred by decision on 2026-09-30. Nothing here is scheduled; the lists are kept so the design work is not lost. Art on disk that could seed future obstacles: `HiOrbit_game/DesertHunter_Phaser/assets/dino.png` (250×250) and `guapen.png` (208×240); neither is in the game.

**Obstacles**

| ID | Obstacle | Behavior and telegraph | Counterplay | New assets | Size |
|---|---|---|---|---|---|
| O-1 | Armadillo (sprite exists) | In the table from Phase 2 at spawn weight 0 (WP2.8). If revived: static first, then curls and rolls across the road when the truck is within about 200 px, with a 1 s "!" telegraph | Time the lane change | none | S static, M roll |
| O-2 | Dust devil | Drifts diagonally; overlap pushes the truck sideways for about 0.8 s (not lethal) | Steer against it or avoid | 1 sprite | M |
| O-3 | Meteor shower | A ground shadow grows for 1 s, then a crater stays as an obstacle for a few seconds | Read the shadows | shadow (procedural), rock reuse | M |
| O-4 | Oil or sand patch | Not lethal; steering slips and trailer sway doubles for about 2 s | Avoid or brake | 1 flat sprite | S–M |
| O-5 | Cattle crossing | Three or four slow animals cross in a line with one gap | Brake or boost through the gap | 1–2 sprites | M |
| O-6 | Slow RV or pickup | Slower vehicle in your lane; passing it earns a bonus | Weave | 1–2 sprites | M |
| O-7 | UFO variants | Tractor beam that drags the truck sideways, or mine drops | Boost or steer | 1 sprite plus procedural | M–L |

**Powerups**

| ID | Powerup | Effect | Notes | Size |
|---|---|---|---|---|
| P-1 | Shield ("cactus armor") | Absorbs one hit, including one UFO beam tick; 0.75 s invulnerability afterwards | Needed because the game is one-hit death | M |
| P-2 | Nitro | About 4 s boost with a x3 multiplier | Rewards risky driving | M |
| P-3 | Bulldozer bumper | About 5 s of smashing rocks and tumbleweeds for points; trees and the UFO still kill | Needs a per-entity `smashable` flag | M |
| P-4 | EMP jammer | Cancels the current UFO attack and delays its next visit | Gives counterplay to the boss; depends on `UfoSystem` | S–M |
| P-5 | Time warp | World speed x0.6 for about 4 s, score rate unchanged | Cheap: one speed multiplier | S–M |

**If this is revived, a suggested first slice:** armadillo (roll), dust devil, meteor shower, shield, nitro.

## 9. Design guardrails

1. Every hazard is telegraphed for at least 0.75 s before it can hurt.
2. Never spawn a hazard row that blocks the full road width; always leave a passable path. Minimum gap between spawns scales with speed (WP2.4).
3. Pickups never spawn within about 150 px of a hazard in the same lane.
4. At most one new hazard type is introduced per score tier.
5. Initial tiers (tune in playtests): T1 0–1,999 tumbleweed, rock, tree, turtle, static armadillo; T2 2,000–4,999 adds the UFO, oil or sand, slow vehicles; T3 5,000 and up adds dust devils, meteors, cattle.
6. At most one pickup on screen; the first appears after about 20 s, then every 20–30 s; the same effect refreshes its duration rather than stacking.
7. All numbers live in `config.js` or `entities.js`.

## 10. Verification and quality gates

**Per-PR smoke checklist** (desktop Chrome and Safari, plus one touch device or emulation):

1. Loads with no console errors from our code; the Phaser version logged is 3.90.0.
2. Keyboard (arrows/WASD) and touch (left/right steer, top boost, bottom brake) both work.
3. Crash, then initials form (score 1,000 or more), submit or skip, leaderboard, restart. State fully resets (score, speed, obstacles, UFO).
4. UFO cycle completes (approach, lock, charge, fire x3, leave); the beam only kills inside its width.
5. Multiplier x2 at the speed threshold; score increments as obstacles pass.
6. Engine pitch follows speed after first input; UFO tones, crash sound, music, and mute all work.
7. 60 s run holds 55 fps or better at 60 Hz; speed feels the same at 120/144 Hz if available.
8. Fullscreen works; portrait phone viewport is playable.

**Other gates**

- **Determinism:** with `?seed=` and `advanceTime`, `render_game_to_text` snapshots must match before and after refactors (WP1.1, WP1.3).
- **Budget:** own art and code (excluding Phaser and the BGM) 500 KB or less; interactive before the BGM finishes loading (the BGM stays at about 23 MB by decision D8).
- **Asset gate:** run `tools/audit_sprites.py` after any art change: every pixel is on the palette, alpha is 0 or 255 only, and frame sizes match `art/sprites.json` (Appendix B).
- **Playtest log** after WP2.7 and after each content slice: 10 runs, cause of each death.

## 11. Risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | Phaser 3.55 to 3.90 behavior differences (TileSprite, text, physics) | Medium | Pin; section 10 checklist; `v0-prototype` rollback |
| R2 | Fixed step changes the feel | Medium | Keep constants unchanged; compare to the WP0.3 baseline |
| R3 | Hitbox rebalance shifts difficulty unexpectedly | Medium | Overlay plus playtest log; old values stay in git history |
| R4 | New content, if revived, needs art that does not exist | Low now | Deferred with Phase 3; Appendix B spec keeps new art on the palette |
| R5 | Music stays as is: about 27 MB total download and about 270 MB decoded on phones | Medium | BGM loads after start (WP1.4); measure on a phone (WP1.9); contingency is HTML5-audio streaming, no file change |
| R6 | Pages serves stale modules from cache | Low | `?v=` cache-bust; hard refresh during verification |
| R7 | Scope creeps back into tooling | Medium | Non-goals list; gameplay justification required |
| R8 | iOS Safari audio differences | Medium | Resume on first gesture; test on a real device |
| R9 | Palette quantization flattens the art (lost accents, flat road) | Medium | Start at about 48 entries; locked palette with before/after approval (WP1.8); fallback to unquantized re-baked sprites |
| R10 | Re-baked car and trailer replace the curated 13–14 colour versions | Low | Decided (O8); side-by-side review in WP1.8 |

## 12. Open decisions

| ID | Decision | Status | Outcome or recommendation | Needed by |
|---|---|---|---|---|
| O1 | New obstacles and powerups | Decided 2026-09-30: deferred | Nothing scheduled; backlog in section 8 | — |
| O2 | Art style direction | Decided 2026-09-30: shared palette, as an attempt with a fallback | D7; size and lock in O7 and WP1.8 | — |
| O3 | Music | Decided 2026-09-30: leave the file as is | D8; contingency in WP1.9 | — |
| O4 | Purge the 28 MB zip from git history | Decided 2026-09-30: purge (this fork only) | Done locally with `git filter-branch` on `main`; the original tip is preserved until the force-push (WP1.11). Only `HiOrbit_Game.zip` was purged | WP1.11 |
| O5 | Sprite export policy | Resolved 2026-09-30 | Bake at on-screen size from the 1024 px originals, which exist (Appendix A.6) | — |
| O6 | Music license or provenance for `assets/8bit_radio.mp3` | Resolved 2026-09-30: verified by the owner | — | — |
| O7 | Palette size and lock | Approved 2026-09-30: start from the 48-colour candidate | The owner approved the prototype look (textured asphalt kept). The final lock, including pruning near-duplicates by hand, is WP1.8 | WP1.8 |
| O8 | Car and trailer sources | Decided 2026-09-30: re-bake from the 1024 px originals | Same pipeline as every other sprite; the curated 85 px and 128 px versions are retired | — |

## 13. Release and rollback

- Pages serves `main` from the repo root. Each merge deploys.
- **Live verification** after each release: open the live URL with a hard refresh, play one full run including a crash and restart, check the console.
- **Rollback:** revert the merge, or deploy the `v0-prototype` tag if needed.
- No CI yet. Add a GitHub Action (HTML/JS lint) only if regressions justify it.

## Appendix A. Sprite and hitbox audit

### A.1 Method

Pixel analysis (Pillow and numpy) of `HiOrbit_redux/content/assets/sprites/*.png`, plus the redux `entities/*.json` for scale and hitboxes. The redux sprites are byte-identical (checked by MD5) to `HiOrbit_game/public/assets/sprites` and `HiOrbit_game/Damien Scratch/AssetsToUpdate`. On-screen figures are pixels multiplied by the JSON scale. Hitbox coverage uses an α≥128 mask. Fork hitboxes were modelled exactly as `game.js` codes them. `tools/audit_sprites.py` (WP0.4) reproduces this. A.6 covers art lineage and A.7 the palette prototype.

### A.2 Inventory and quality

| Sprite | File px | Visible art px | Aspect (w/h) | Colours (α≥240) | JSON scale | Visible on screen | Note |
|---|---|---|---|---|---|---|---|
| car | 85×85 | 39×82 | 0.48 | 13 | 1.566 | 61×128 | Limited-palette pixel art; non-integer upscale |
| trailer | 128×128 | 53×105 | 0.50 | 14 | 1.04 | 55×109 | Same style; scale 1.0 would be imperceptibly smaller |
| rock | 64×64 | 57×56 | 1.02 | 1,400 | 0.80 | 45×44 | Renders 64% of its pixels |
| tree | 128×128 | 101×111 | 0.91 | 2,318 | 1.20 | 119×130 | 23% of visible pixels are soft (leaf edges) |
| tumbleweed | 128×128 | 91×78 | 1.17 | 1,789 | 0.64 | 57×49 | Renders 41% of its pixels |
| turtle | 64×64 | 32×41 | 0.78 | 734 | 0.96 | 30×38 | Near 1:1; fine |
| ufo | 128×128 | 103×65 | 1.58 | 1,963 | 1.20 | 122×76 | Fine |
| armadillo | 64×65 | 64×64 | 1.00 | 2,404 | 0.60 | 38×38 | PNG is 65 px tall but JSON says 64×64; art touches all four frame edges; renders 36% of its pixels |
| road | 1024×1004 | full | 1.02 | opaque | 1.0 | tiled | See A.4 |

Findings:

1. Overall the art reads well at game scale. Alpha is clean: at least 90% of visible pixels are α≥240 on every sprite except the tree (the many α=253 values are visually opaque).
2. There are two styles. Car and trailer are true limited-palette pixel art with hard edges. Everything else is smooth downsampled illustration (700–2,400 colours). The armadillo matches the majority. This was decision O2, resolved as a shared palette (D7).
3. Pixel density is inconsistent. JSON scales range from 0.60 to 1.57. With `pixelArt: true` (nearest-neighbour), scales below 1 drop source pixels unevenly and non-integer upscales make some pixels 1 px and some 2 px. The original goal in `HiOrbit_game/Damien Scratch/project plan.md` was consistent pixel scaling; matching on-screen size did not achieve it.
4. Payload: the seven shared object sprites total about 58 KB against 3.3 MB for the fork's 1024 px set, about 56x smaller (the armadillo adds 11 KB). At rest the two sets look nearly identical; the win is memory and download. The road is now the largest sprite (905 KB).
5. The native set is a lossy derivative of the 1024 px originals (A.6), so re-baking from the originals is cleaner than adopting it (A.7).

### A.3 Hitboxes (on-screen px)

| Entity | Fork hitbox | Redux hitbox | Visible art | Redux hitbox / art area | Note |
|---|---|---|---|---|---|
| car | 67×80 | 60×120 | 61×128 | 108% | Redux 50% longer; covers 97% of the art |
| trailer | 67×67 | 60×100 | 55×109 | 106% | Redux 50% longer |
| rock | 36×31 | 36×31 | 45×44 | 78% | Unchanged |
| tree | 46×46 | 46×46 | 119×130 | 36% | Same size, different position (finding 4) |
| tumbleweed | Ø49 (off-centre) | Ø29 | 57×49 | 45% | Redux 42% smaller |
| turtle | Ø31 (off-centre) | Ø31 | 30×38 | 83% | Fork circle only 27% on the art |
| armadillo | n/a | Ø19 | 38×38 | 27% | Very generous |
| ufo | Ø108 | Ø108 | 122×76 | 155% | Unused for collision (the beam checks `car.x` only) |

Findings:

1. Redux carried frame-relative ratios over to art with different padding, so difficulty drifted: player vehicles are about 50% longer (harder), the tumbleweed about 42% smaller (easier). Balance must be re-tuned deliberately (WP2.7).
2. Redux fixed a fork bug: the turtle and tumbleweed circles are now centred on the art.
3. Redux's debug overlay draws `body.radius`. In Phaser 3.90.0 that is the unscaled source radius (set only in `setCircle`), while physics uses the scaled `halfWidth`. Overlay circles are wrong whenever scale is not 1: the tumbleweed draws r≈22 against a real r≈14. Use `halfWidth`.
4. Tree: the redux box spans 45–75% of frame height (upper trunk and branch junction) and is 38 source-px wide, while the trunk base is 14 source-px wide (x 57–70) and sits at 81–94%. The fork's semantics (top edge at 0.6, so 60–90%) fit the new art better. Redux's `centerYRatio: 0.6` looks like an offset-versus-centre slip. Use 0.75, then verify with the overlay.

### A.4 Road and lanes

The road art is identical in the fork and redux. Asphalt occupies texture columns 409–614 (206 px wide, centre 511.5); edge lines sit at 398.5 and 617.5; centre dashes at 507 and 517.

With `tilePositionX = 260` ([game.js:148](game.js#L148)), asphalt spans screen x 149–354 (centre 251.5) and the centre dashes sit at 247–257. Gameplay constants centre on 240: road bounds 160–320, off-road shake outside them, truck start at 240. The art is 11.5 px right of the logic, so 34 px of right-hand asphalt counts as "rough terrain".

Fix (WP1.6): `tilePositionX = 272`, giving asphalt 137–342 (centre 239.5). The 160–320 bounds stay roughly valid (truck half-width is about 30 px); re-derive tree zones and verify with the overlay.

### A.5 Actions

| Action | Work package |
|---|---|
| Rebuild sprites from the 1024 px originals through the palette pipeline (armadillo from its 64×65 PNG) | WP1.7, WP1.8 |
| Re-centre the road; move lane constants to config | WP1.6 |
| Fix the overlay radius; tree centre; centre all circles | WP2.2 |
| Rebalance hitboxes on the baked sprites | WP2.7 |

### A.6 Art lineage and sources

Question raised 2026-09-30: do the original art files exist?

- **No layered sources** (`.aseprite`, `.psd`, `.kra`, `.xcf`) exist for these sprites within six directory levels of the workspace; the only PSDs belong to `TommysBirthdayGame`. Spotlight does not index the workspace, so a machine-wide name search was not possible. A targeted search of Desktop, Documents, Downloads and Pictures found only the armadillo files below.
- **The 1024 px PNGs are the highest-resolution originals on disk.** Identical copies live in `DesertDrifter/assets`, `EntityManager` (`public`, `dist`, `tools/hiorbit/output`) and `Sandbox` (`HiOrbit`, `gdm`). `HiOrbit_Game.zip` is an older snapshot of the same files and holds nothing unique.
- **The native-size set is derived from them.** Nearest-neighbour downscaling of the originals reproduces the native tree, tumbleweed, turtle and UFO exactly (zero error): those four are every 8th or 16th pixel of the originals. Rock differs slightly (mean error 7.4 of 255), car 3.0, and trailer 10.6 with the art shifted about 3 px, so those three were edited after sampling. Nearest-neighbour sampling discards most source pixels, which is why the current sprites look aliased next to area-averaged versions (A.7).
- **The armadillo has no hi-res original.** `~/Downloads/armadillo.png` is the same 64×65 file used in redux, and `~/Downloads/Armadillo2.png` is an opaque 64×65 variant with a background.

### A.7 Shared palette prototype

Method: sprites re-baked from the 1024 px originals (armadillo from its 64×65 PNG) at their on-screen sizes, area-averaged on premultiplied alpha, alpha thresholded at 128. The palette comes from k-means in OKLab over all sprites and the road (each image weighted equally, the road 1.5x, saturated colours boosted). Each pixel maps to the nearest palette entry, with no dithering. The prototype scripts live in the session scratch area; WP1.7 turns them into `tools/build_sprites.py`.

Mean colour shift is OKLab ΔE×100 (under about 2 is barely perceptible). "Accent pixels" are the high-chroma pixels (UFO LEDs, tail lights, teal chevron, car trim). "n/m" means not measured.

| Palette | Sprite mean ΔE range | Road mean ΔE | Accent pixels ΔE (UFO / trailer / car) | Road tones | Verdict |
|---|---|---|---|---|---|
| 16 | 2.2–4.5 | 1.6 | n/m | n/m | Rejected: asphalt turns brown, red accents lost |
| 24 | 1.2–3.4 | 1.1 | n/m | n/m | Usable; UFO mint LEDs go olive |
| 32 | 0.9–2.5 | 1.0 | 6.8 / 1.4 / 2.0 | 21 | Usable; UFO mint LEDs go olive |
| 40 (34 plus 6 reserved accent slots) | 0.9–2.4 | 0.9 | 5.1 / 2.0 / 3.4 | 26 | Mixed: helps the UFO, hurts car accents |
| 48 | 0.8–1.9 | 0.5 | 4.7 / 1.3 / 1.6 | 30 | Best: every accent survives, road keeps its texture |

Findings:

1. Re-baking from the originals is cleaner than the current native sprites (visible in tree leaves, turtle and tumbleweed edges). Re-baked car and trailer look equivalent to the curated versions (decision O8).
2. A shared palette holds up: at 48 entries every sprite shifts by under 2 on average and the set reads as one style.
3. Below 48, small accents (UFO LEDs) drift. Automatic slot reservation was not better than plain 48, so the lock step (WP1.8) is a human review.
4. Payload at 48 entries as indexed PNGs: all sprites 15.3 KB together and the road 31.6 KB (from 905 KB), so all art is about 47 KB, against about 4.2 MB in the fork today.
5. Not attempted: dithering, hand cleanup, or a coarser common pixel grid (for example 2×2 screen pixels per art pixel), which would need the art redrawn at half size.

## Appendix B. Sprite spec for new assets

- **Source:** a 1024 px PNG with transparent background in `art/source/` (`tools/fix_assets.py` removes backgrounds). `tools/build_sprites.py` downsizes and quantizes it; generated PNGs in `assets/sprites/` are never hand-edited.
- **Palette:** only colours from `art/palette.hex` (D7). Adding a colour is a deliberate palette change followed by a rebuild of every sprite.
- **Format:** indexed PNG, alpha 0 or 255 only, no light or dark halo when checked over both the asphalt and the sand.
- **Frame size:** even dimensions. Small hazards 48–64 px; large hazards (cattle, RV) 128 px or less; pickups 32×32. Visible art centred, with at least 2 px transparent margin. Sizes are listed in `art/sprites.json`.
- **Scale:** the entity scale is 1.0; the display size is baked into the PNG. Avoid scales below 1.
- **IDs and files:** `snake_case` IDs matching `^[a-z0-9_]{1,50}$`; file at `assets/sprites/<id>.png`.
- **Hitbox:** recorded in `entities.js`, checked with the overlay; targets in WP2.7.
- **Frame check:** the PNG dimensions must equal `art/sprites.json` (the armadillo failed this); run `tools/audit_sprites.py`.
- **SFX:** procedural (Web Audio) by default, like the existing sounds.
- **Not a fit:** `GraphicsGenerator/` targets skeleton-rigged, animated characters (.NET), not static props.

## Appendix C. References

- This repo: [game.js](game.js), [index.html](index.html), [README.md](README.md)
- Redux: `src/scenes/GameScene.ts`, `src/audio/AudioManager.ts`, `src/managers/HighScoreManager.ts`, `src/factory/EntityFactory.ts`, `src/types/entities.ts`, `content/entities/*.json`, `content/config/game.json`, `content/assets/sprites/*`, `HiOrbit_redux_implementation.md` (section 2b)
- `HiOrbit_game/Damien Scratch/project plan.md` (pixel-scale consistency goal)
- Workspace doc conventions: `_docs/templates/frontmatter-template.md`
- Palette prototype (2026-09-30): Python scripts in the session scratch area; promoted to `tools/build_sprites.py` in WP1.7

## Change log

- 2026-09-29: Plan created from an audit of DesertDrifter, HiOrbit_game and HiOrbit_redux.
- 2026-09-30: Decisions recorded: new content deferred (O1), shared palette (O2), music unchanged (O3), music license verified (O6). Later the same day: zip purged from history (O4), 48-colour candidate approved (O7), car and trailer re-baked (O8); `v0-prototype` tagged and branch `refactor/es-modules` started. Art lineage and palette prototype added (Appendix A.6, A.7); WP1.7 to WP1.11 reworked; D7 and D8 added.
