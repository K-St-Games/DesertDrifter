---
title: "DesertDrifter Standards Alignment and Stability Plan"
description: "Orchestration-ready plan: fix the four open gameplay issues, put the simulation under one controlled clock and RNG, and add small safeguards, without a rewrite or new content."
status: landed
status_detail: "all work packages merged as PRs #9-#22 on 2026-10-03; owner decisions answered (D1 keep 60Hz, D2 add e8c32a yellow, D3 Phase B approved, C4 declined); ISSUE-1..4 closed"
owner: "K_St_Games Team"
author: "Codex (assessment), revised by Claude for orchestration handoff"
created: 2026-10-03
last_updated: 2026-10-06
kind: plan
parent: "PLAN.md"
supersedes: "STANDARDS_ALIGNMENT_RECOMMENDATIONS.md (never committed)"
---

# DesertDrifter Standards Alignment and Stability Plan

**Written by:** Codex (assessment, 2026-10-03), revised by Claude for orchestration handoff
**Read by:** The orchestration agent and the owner
**Validated by:** Static inspection of the code at commit `9516e9c` (`main` plus the UFO beam fix). No code was changed and no playthrough was run for this document. Every claim about code carries a file reference so the orchestrator can re-check it.

This plan is a proposal until the owner answers the decisions in section 4. Accepted architecture choices stay in [PLAN.md](PLAN.md) (native ES modules, no build step, declarative entity tables, new content deferred). Open bugs are in [ISSUES.md](ISSUES.md).

## 1. Goal and non-goals

**Goal.** Make the game feel right and behave reproducibly:

1. Fix the four open issues in `ISSUES.md` (speed, yellow centre line, road seam, sprite jitter).
2. Run gameplay from one controlled clock, one gameplay random stream and one per-step input object, so a run can be replayed and tested.
3. Add small safeguards (storage, config validation, centralized tuning).

**Non-goals** (do not start these, even if convenient):

- New obstacles or powerups (Phase 3 of PLAN.md stays deferred).
- A bundler, TypeScript, JSON content registry, editor server or shared npm package.
- Extracting a renderer-independent simulation. It stays a long-term option, to be chosen for a concrete need.
- Changing balance (spawn rates, hitbox sizes, scoring) except where a work package says so. Structural changes and balance changes ship in separate PRs.

## 2. Ground rules for the orchestrator

- **Repo and remote.** Work only in `K-St-Games/DesertDrifter`. Never push to or open PRs against `tmest`'s repository (`thomasmeston/DesertDrifter`). Never force-push `main`.
- **Branching.** PRs #1 to #6 are merged. Branch new work from `main` and open PRs against `main`. Note that #6 (the UFO beam fix) was merged into `feat/polish-docs` after that branch had already landed, so the fix is not on `main` until the follow-up PR "Fix stale UFO beam" lands. Confirm it is on `main` before starting work that touches `UfoSystem.js`.
- **One PR per work package** (or per closely coupled pair), small enough to review alone. Branch names: `fix/<topic>`, `feat/<topic>`, `docs/<topic>`.
- **Commit trailers.** Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Do not merge PRs or change repo settings** (Pages, branch protection) without the owner's OK.
- **Never run unrelated servers' ports.** Port 8123 is used by another project; use a free port and check with `curl` that the response comes from this repo.
- **Browser testing caveats.** A hidden browser pane pauses `requestAnimationFrame`; a screenshot wakes it. Live Server (port 5500) reloads the page on any file change, including git operations, and looks like a random restart. Use a plain `python3 -m http.server` for test runs.
- **No dead links.** Links outside the repo (`../../K_St_Games/...`) 404 on GitHub. Write workspace paths as plain code text and say they are local.
- **Report outcomes faithfully.** If a check fails or is skipped, say so in the PR body.

## 3. Current state (facts the plan builds on)

| Area | Fact | Where |
|---|---|---|
| Step loop | Fixed 60 Hz accumulator; `update()` runs `step()` 0..n times per frame, delta clamped to 100 ms | `src/scenes/GameScene.js` `update`/`step`, `TUNING` in `src/config.js` |
| Road scroll | `road.tilePositionY -= currentSpeed * 2` per step; base speed 1, +0.0001 per step, cap 1.8; boost +4, brake -0.5 | `GameScene.step`, `src/input/Controls.js` |
| Obstacle motion | Y moves in `step()` (`child.y += currentSpeed * 2`); X moves through Phaser physics velocity set at spawn | `src/systems/SpawnSystem.js:34`, `src/behaviors.js` |
| Car motion | `setVelocityX(±200)` in `step()`, integrated by Arcade physics on Phaser's own timing, not on our step | `GameScene.step` |
| Timers | Spawn and UFO respawn compare `scene.time.now` (real clock, keeps running during pause); UFO attack timers count steps | `SpawnSystem.js:17,24,28`, `UfoSystem.js:35,37,143` |
| Randomness | `?seed=` replaces global `Math.random`; Phaser `Between`/`FloatBetween` all draw from it. Gameplay, cosmetic shake, and the music start offset share the stream | `src/main.js`, `GameScene.js:42,205-206,227-228` |
| Input | Controls read live keyboard/pointer state inside `step()` | `src/input/Controls.js` |
| Observation | `window.render_game_to_text` exists; no `advanceTime`; snapshot omits tick, pause, RNG and timers | `GameScene.renderGameToText` |
| Storage | `HighScoreManager` guards reads but writes unguarded; mute writes are guarded | `src/managers/HighScoreManager.js:38`, `src/audio/AudioManager.js:142` |
| Road art | `assets/sprites/road.png` is 1024x1024, 48-colour indexed, baked from `art/source/road.png`; `tilePositionX` 272 centres the asphalt | `tools/build_sprites.py`, `art/sprites.json`, `art/palette.hex` |
| Debug | Key `0` overlay always available; `?debug` only exposes `window.game` | `src/debug/CollisionDebug.js`, `src/main.js` |
| Kit reference | Local draft `kst-game-kit/STANDARDS.md` is now marked `standards@0.3.0` (the earlier assessment cited 0.2.0). It is advisory and unreleased; cite it as a local reference only | workspace, not in this repo |

Reproduction aids that already exist: `?seed=<text>`, `?debug`, `window.render_game_to_text()`, key `0` hitbox overlay. The earlier parity harness (original vs refactor) lived in a throwaway scratch folder and is **not** in this repo; WP-A0 rebuilds the part that is needed.

## 4. Owner decisions needed

| ID | Decision | Why it matters | Default if the owner does not answer |
|---|---|---|---|
| D1 | **Target game speed.** Keep the 60 Hz-equivalent pace, or match the original as played on the owner's display? | ISSUE-1. The original advanced per rendered frame, so on a 120 Hz display it ran twice as fast. The current build matches the original on 60 Hz displays only. WP-A3 cannot finish without this. | Keep 60 Hz pace; record the road speed in px/s in `TUNING` comments. |
| D2 | **Centre line colour.** Which yellow, and does it change the palette? | ISSUE-2. The 48-colour palette is shared with other sprites; adding or swapping an entry requires a full rebake and audit. | Pick the closest existing palette yellow; add a colour only if none is acceptable. |
| D3 | **Scope of Phase B.** Approve the clock/RNG/input work, or do only Phase A and C? | Phase B touches `GameScene.step` and can change feel. | Do Phase A and C first; hold Phase B for a go-ahead. |

## 5. Work packages

Each package lists goal, files, steps, acceptance checks, dependencies and risk. "Verify" means: run in a browser at both 60 Hz and 120 Hz behaviour (see WP-A0) and attach the numbers to the PR.

### Phase A: visible bugs (ISSUES.md)

**WP-A0: Measurement harness** (prerequisite for A3, A4, B1 to B5)
- *Goal:* Repeatable numbers for speed and jitter, kept in the repo.
- *Files:* new `tools/measure/` (a small Node or in-page script, no build step) and a short section in `README.md`.
- *Steps:* (1) A page-side probe, enabled by `?debug`, that records per rendered frame: time, road `tilePositionY`, every obstacle's `y`, car `x`, and how many `step()` calls ran this frame. (2) A runner that drives the game in a browser with `?seed=` at a throttled 60 Hz and at an unthrottled 120 Hz-or-higher cadence and writes JSON. (3) A summariser: road px/s, per-frame y-delta variance for the sprites vs the road.
- *Acceptance:* Running it twice with the same seed gives the same road speed within 1%. Numbers for the current build are recorded in `ISSUES.md` under ISSUE-1 and ISSUE-4.
- *Depends on:* nothing. *Risk:* low.

**WP-A1: Yellow centre line** (ISSUE-2, art only)
- *Files:* `art/source/road.png`, `art/palette.hex` (only if D2 requires), `assets/sprites/road.png` (generated), `tools/build_sprites.py`, `tools/audit_sprites.py`.
- *Steps:* recolour the dashed centre pixels in the 1024 px source; check the nearest palette entry is the intended yellow; rebake with `python3 tools/build_sprites.py`; run `python3 tools/audit_sprites.py`. If the palette changes, rebake **all** sprites and compare before/after screenshots of every entity.
- *Acceptance:* centre dashes render yellow in-game; audit passes; no other sprite changed unless the palette changed (then every sprite is visually checked).
- *Depends on:* D2. *Parallel with:* everything except WP-A2 (same source file). *Risk:* low.

**WP-A2: Seamless road tile** (ISSUE-3)
- *Files:* `art/source/road.png`, generated `assets/sprites/road.png`, `tools/build_sprites.py`, `src/scenes/GameScene.js` (road tile setup), `art/sprites.json`.
- *Steps:* (1) Measure the dash period in the source art and compare it to the 1024 px texture height; the seam appears when the height is not a whole multiple of the period or the edges differ. (2) Inspect how `HiOrbit_redux` builds its road tile (workspace path `KST/K_St_Games/HiOrbit_redux`, local reference) and port the approach: texture height a whole multiple of the dash period with identical top and bottom rows. (3) Rebake. (4) Scroll one full loop and check the seam at the wrap point.
- *Acceptance:* a frame captured just before and just after the wrap point (`tilePositionY` crossing a multiple of the texture height) shows no visible discontinuity in the dashes, verified by pixel comparison of the two seam rows in the baked PNG plus a screenshot.
- *Depends on:* WP-A1 (same source file; do after it merges or in the same PR). *Risk:* medium: changing texture height changes `tilePositionX/Y` maths.

**WP-A3: Game speed** (ISSUE-1)
- *Files:* `src/config.js` (`TUNING`), `README.md`.
- *Steps:* (1) Use WP-A0 to measure road px/s in this build. (2) Measure the original (`git show v0-prototype:game.js`, run on 60 Hz and on the owner's display) the same way. (3) Apply decision D1 by changing `baseSpeed`/`speedIncrement` or the step rate. (4) Re-check difficulty: spawn delay depends on speed (`1500 / (speed * 0.8)` in `SpawnSystem.js:26`), so a faster base speed also spawns obstacles faster.
- *Acceptance:* measured road px/s matches the D1 target within 2% at 60 Hz and at 120 Hz+; the target and the measurement are written in `TUNING` comments and the PR body.
- *Depends on:* WP-A0, D1. *Risk:* medium: it is a balance change; keep it separate from structural PRs.

**WP-A4: Sprite jitter** (ISSUE-4)
- *Files:* `src/scenes/GameScene.js`, `src/systems/SpawnSystem.js`, `src/config.js`, possibly `src/factory/EntityFactory.js`.
- *Steps:* (1) Use WP-A0 to find which cause applies, in this order: (a) road `tilePositionY` and sprite `y` round differently (fractional steps such as 2.15 px) — test `roundPixels: true` in `createGameConfig`, or round both to integers; (b) steps per frame vary (0, 1, 2) so on-screen motion is uneven — add render interpolation between the previous and current step positions, or accept the step rate and round; (c) Arcade physics integrates X and the car on its own step — resolved by WP-B2. (2) Fix the proven cause only. (3) Do not change simulation positions used for collision.
- *Acceptance:* with the WP-A0 probe, per-frame y-delta of an obstacle has no frame where it moves less than half or more than 1.5x the expected amount, at 60 Hz and 120 Hz+; hitbox overlay (`0`) still tracks the sprites.
- *Depends on:* WP-A0. May overlap with WP-B2. *Risk:* medium.

### Phase B: one clock, one RNG, one input (needs D3)

Order is strict because these packages edit the same files (`GameScene.js`, `SpawnSystem.js`, `UfoSystem.js`). Do not run them in parallel.

**WP-B1: Single gameplay clock**
- *Goal:* All gameplay timers use a tick counter owned by the scene's step loop, not `scene.time.now`.
- *Files:* `GameScene.js`, `SpawnSystem.js`, `UfoSystem.js`, `src/config.js`.
- *Steps:* add `this.tick` incremented once per `step()`; convert `firstSpawnDelayMs`, spawn delay, UFO `respawnMs`, `restartLockoutMs` and `gameOverAt` to tick-based values (ms divided by `stepMs`, rounded once, documented); pass `tick` into the systems; define pause behaviour: while paused the tick does not advance, so cooldowns do not elapse.
- *Acceptance:* with the same seed and inputs, spawn positions and times (in ticks) are identical at 60 Hz and 120 Hz+; pausing for 30 s then resuming does not trigger a spawn burst or UFO respawn; restart lockout still takes about 500 ms.
- *Risk:* medium: spawn timing moves from float ms to integer ticks (up to one step of difference). Record the before/after spawn tick sequence in the PR.

**WP-B2: Physics on the same driver**
- *Goal:* The car and obstacle X motion and collision advance exactly once per gameplay step.
- *Files:* `GameScene.js`, `src/config.js`.
- *Steps:* check in the Phaser 3.90 Arcade source how `World.update`, `step` and colliders interact; pause the world's automatic update and call `world.step(stepMs / 1000)` from `GameScene.step()`; confirm overlap callbacks still run once per step; keep `hitObstacle`'s re-entry guard.
- *Acceptance:* car X after N steps with steering held is the same at 60 Hz and 120 Hz+ (±0.01 px); a scripted crash happens on the same tick in both; the pause key still freezes everything.
- *Depends on:* WP-B1. *Risk:* high: affects steering feel and trailer motion. Compare car/trailer X traces before and after.

**WP-B3: Gameplay RNG separate from cosmetic and audio**
- *Files:* new `src/sim/rng.js`, `src/main.js`, `SpawnSystem.js`, `UfoSystem.js`, `src/behaviors.js`, `GameScene.js`.
- *Steps:* implement a small seeded generator (the mulberry-style one now inlined in `main.js`) as an instance with `int(min, max)` and `float()`; give spawn, behaviors and UFO targets their own instance; seed it from `?seed=` or from `Math.random()` when absent; stop replacing global `Math.random`; leave the HUD shake (`GameScene.js:205-206,227-228`) and music offset (`GameScene.js:42`) on `Math.random`. Keep the draw order inside spawn and behaviors unchanged (`behaviors.js` states the order is part of the feel).
- *Acceptance:* two runs with the same seed and inputs produce identical obstacle sequences even when the music finishes loading at a different time; unseeded runs still vary.
- *Depends on:* WP-B1 (so a replay is meaningful). *Risk:* medium: any change in draw order changes the sequence a given seed produces; record that old seeds will not reproduce old runs.

**WP-B4: Per-step input object**
- *Files:* `src/input/Controls.js`, `GameScene.js`.
- *Steps:* add `Controls.sample()` returning a plain `{ steer: -1|0|1, speedDelta, restart, pause, mute }` taken once per rendered frame (held keys) and consumed by each step; `step()` reads only that object. Keyboard and touch both produce it. Keep the touch zones as they are (`pointer.y < 320` boost, `> 500` brake, left/right half steer).
- *Acceptance:* behaviour with keyboard and touch is unchanged by manual test; a test can feed a hand-written object to `step()`.
- *Depends on:* WP-B1. *Risk:* low-medium: key-capture handling around the high-score form must keep working (`showForm`/`hideForm`).

**WP-B5: Manual advancement and richer snapshot**
- *Files:* `GameScene.js`, `README.md`.
- *Steps:* add `window.advanceTime(ms)` (only when `?debug`) that runs whole steps with real-time updates suspended; extend `render_game_to_text` with `tick`, `paused`, `seed`, RNG state, spawn countdown, UFO timers and units (px, ticks).
- *Acceptance:* `advanceTime(1000)` runs exactly 60 steps; two sessions with the same seed and the same scripted inputs end on an identical snapshot after 30 s of simulated time.
- *Depends on:* WP-B1 to B4. *Risk:* low.

**WP-B6: Replay check in the repo**
- *Files:* new `tools/replay/` and a README section.
- *Steps:* record a scripted run that passes through spawning, the UFO warning and fire, a crash and a restart; save the expected snapshots as a golden file; add a runner that compares them.
- *Acceptance:* the runner passes on the branch tip and fails when a spawn weight or step timing is deliberately changed.
- *Depends on:* WP-B5. *Risk:* low.

### Phase C: small safeguards (independent; can run alongside Phase A)

**WP-C1: Storage safety.** Guard `HighScoreManager.save` writes with try/catch (same pattern as the mute write at `AudioManager.js:142`); add a version field to the stored shape and define recovery for older or malformed data. *Acceptance:* with `localStorage.setItem` throwing, the game-over and initials flow completes without an exception; old stored scores still load.

**WP-C2: Entity table validation.** Add a boot-time check (and optionally a `tools/` script) over `src/entities.js`: file exists in `assets/sprites/`, behavior id exists in `BEHAVIORS`, spawn weights and zones valid, collision ratios in range. *Acceptance:* a bad row fails with a field-specific message; the current table passes.

**WP-C3: Centralize remaining tuning values.** Move the literals still in code into `src/config.js`: spawn delay constants in `SpawnSystem.js:26-27`, car speed 200 and tilt 5 degrees, trailer lerp 0.08 and sway factors, boost +4 and brake -0.5 in `Controls.js`, UFO target ranges in `UfoSystem.js`. No value changes. *Acceptance:* a diff of the replay (WP-B6, or a seeded snapshot if B6 has not landed) shows no behaviour change.

**WP-C4 (optional): Gate developer access behind `?debug`.** Key `0` overlay and any future panel should be active only with `?debug`. Needs owner OK because it changes the documented key `0` behaviour in the README.

### Phase D: release gates (owner action; orchestrator prepares)

- Phone test of music startup and memory (PLAN WP1.9). If it stalls, switch the music to streaming through an HTML5 audio element instead of decoding the whole 23 MB file.
- Enable GitHub Pages on the fork after PR #1 merges; delete the local backup ref and run `git gc` once the owner confirms the history purge.
- Tag `v1.0.0` after the owner has played the build.

## 6. Orchestration guidance

**Dependency graph.**

```
D1 ─┐
A0 ─┼─> A3
    ├─> A4 ──(overlaps)── B2
D2 ─> A1 ─> A2
D3 ─> B1 ─> B2
        ├─> B3
        └─> B4 ─> B5 ─> B6
C1, C2, C3 independent; C3 is best after B6 so a replay can prove "no change".
```

**Lanes that can run in parallel:** (1) art: A1 then A2; (2) measurement and speed: A0 then A3 and A4; (3) safeguards: C1, C2. Phase B is a single sequential lane. Keep A4 and B2 from running at the same time because both edit `GameScene.step`.

**File ownership.** `GameScene.js` is touched by A2, A4, B1 to B5 and C3. `SpawnSystem.js` by A4, B1, B3 and C3. Only one open PR should edit a given file region at a time; stack PRs where they overlap.

**Verification matrix** (every PR states which it ran):

| Check | How |
|---|---|
| Boots, no console errors | Load with `?debug`; read console |
| Speed at 60 Hz and 120 Hz+ | WP-A0 tool; road px/s |
| Jitter | WP-A0 probe; y-delta spread |
| Hitboxes | Key `0` overlay: circles centred, boxes track sprites |
| Controls | Arrows, WASD, touch; boost, brake, pause `P`, mute `M`; initials form accepts W/A/S/D/Space |
| Crash, restart | Lockout about 500 ms; full state reset; UFO beam cleared |
| UFO cycle | Approach, lock, charge (yellow flicker), fire (green), leave; beam clears after each shot |
| Art | `python3 tools/audit_sprites.py` passes |

**Definition of done for a PR.** Acceptance checks above pass with numbers in the PR body; no unrelated files changed; README or `ISSUES.md` updated (move a closed issue to "Closed" with the PR link); commit and PR attribution lines present.

**Stop and ask the owner when:** a decision in section 4 is needed and unanswered; a change would alter balance beyond the package's scope; a check fails and the cause is not understood after two attempts; any action touches repo settings, Pages, branch protection, history or `tmest`'s repository.

**Report format.** After each package: PR link, acceptance results (numbers), anything skipped and why, and any new issue found (add it to `ISSUES.md`).

## 7. Risks

- **Gameplay feel.** Phases A3, B1 and B2 can change speed, spawn rhythm and steering. Ship them as separate PRs with before/after traces so any one can be reverted.
- **Seed compatibility.** WP-B3 changes which obstacle sequence a given seed produces. Record this in the PR and README.
- **Scope creep.** The kit standards describe many more capabilities (serializable state, editor panels, JSON registries). They are not goals here; only the packages above are approved for this plan.
- **Input and UX regression.** PLAN.md section 4 records that earlier variants lost touch controls and replaced the DOM initials form with `window.prompt`. Preserve touch controls, fullscreen, form focus, restart lockout, mute and audio resume on first input.
- **Tooling.** Keep the no-build, ES-module setup. Test tools may use Node but must not become a runtime dependency.

## 8. Patterns worth feeding back into game-kit

Short list for the owner to carry to the kit repo separately (not part of this plan's work):

- Declarative ES-module entity tables with a small factory and behavior registry work well before a JSON registry is justified.
- Collision overlays should draw the bodies actually used, including scaled circles.
- A fixed-step loop and a seed flag do not by themselves give exact replay; the clock, physics and RNG each need an owner (this plan's Phase B).
- Retrofit acceptance should include input parity, audio activation, form focus, restart behaviour and mobile usability.
- Keep source art, generation parameters, runtime assets and audit checks separate and documented.

## 9. Refresh conditions

Revisit this plan after any of: Phase B lands, an owner decision changes scope, a gameplay or persistence change merges, or target-device evidence is recorded. Update the validated commit hash when it is refreshed.

### 2026-10-06 refresh (project paused)

Phase B landed (merged as PRs #15–#21 on 2026-10-03; validated at `main` = `bedb381`, PR #23). All work packages A0–A4, B1–B6, C1–C3 done; C4 declined by owner decision. Review fixes found after the first pass are also in: B2 call-site correction + boot smoke (`tools/smoke_boot.mjs`), A4 in-step body sync, real palette yellow, rebased seam. No gameplay or persistence change has merged since; no target-device evidence recorded yet (WP1.9 phone test still open). Resume with [PLAN.md](PLAN.md) Phase 4 release gates.
