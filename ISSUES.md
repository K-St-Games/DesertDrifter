# Issues

Open problems and improvements. Add new items at the bottom of the open list; move finished ones to "Closed" with the PR that fixed them.

Status: `open` | `investigating` | `closed`

## Open

### ISSUE-1: Game feels slower than the original
- **Status:** open
- **Reported:** 2026-10-03
- **Symptom:** Overall game speed is lower than the original fork.
- **Hypotheses (unconfirmed):**
  - The original advanced the road once per rendered frame, so on a 120 Hz display it ran at 2x speed. PR #2 moved the simulation to a fixed 60 Hz step (`TUNING.stepMs` in `src/config.js`), which is correct on 60 Hz displays but reads as "slower" if the original was being played at 120 Hz or more. Decide whether the 60 Hz pace is the target or whether the base speed should be raised.
  - Base speed starts at `TUNING.baseSpeed` (1) and ramps by `speedIncrement`; compare these values against the original `game.js` (`git show v0-prototype:game.js`).
  - Fixed-step catch-up is capped by `TUNING.maxFrameMs` (100), so a slow or throttled frame loses time.
- **To do:** measure road px/s in the original (on 60 Hz and on the user's display) and in this build, then pick the target and adjust `baseSpeed`/`speedIncrement`.
- **Measurement (WP-A3, 2026-10-03, branch `fix/game-speed`):** D1 = keep 60 Hz pace, so no `baseSpeed`/`speedIncrement` change. Analytic 30 s neutral: 2*sum(1+0.0001*k, k=1..1800) = 3924.2 px → 130.8 px/s; WP-A0 `simulate.mjs` reports 130.81 px/s at 60 Hz vs 130.84 px/s at 120 Hz (within 0.1%; target: 2%). Difficulty re-check: spawn delay `(1500/(speed*0.8))±100` (min 300 ms, `src/systems/SpawnSystem.js:26`) tightens as speed rises, so raising the base speed would also spawn obstacles faster — left unchanged per D1, no balance change in this package. ISSUE-4/WP-A4 work remains; closing ISSUE-1 is left to the owner.
- **Plan:** WP-A0 and WP-A3 in [STANDARDS_ALIGNMENT_PLAN.md](STANDARDS_ALIGNMENT_PLAN.md); needs owner decision D1.

### ISSUE-2: Road centre lines should be yellow
- **Status:** open
- **Reported:** 2026-10-03
- **Symptom:** The dashes in the middle of the road are not yellow.
- **Notes:** The road is baked from `art/source/road.png` through the shared 48-colour palette (`tools/build_sprites.py`, `art/palette.hex`). Check that the palette has a suitable yellow, then recolour the lines in the source art and rebake. Run `tools/audit_sprites.py` afterwards.
- **Plan:** WP-A1 in [STANDARDS_ALIGNMENT_PLAN.md](STANDARDS_ALIGNMENT_PLAN.md); needs owner decision D2.

### ISSUE-3: Road lines do not tile seamlessly
- **Status:** open
- **Reported:** 2026-10-03
- **Symptom:** The dashed lines don't line up where the road texture repeats. The original has the same flaw; `HiOrbit_redux` fixed it.
- **Notes:** Likely a mismatch between the texture height and the dash period, or the baked road not wrapping cleanly at its top and bottom edge. See how `HiOrbit_redux` builds its road tile and port that approach (texture height an exact multiple of the dash pattern, `tilePositionY` kept consistent). Verify by scrolling and checking the seam.
- **Plan:** WP-A2 in [STANDARDS_ALIGNMENT_PLAN.md](STANDARDS_ALIGNMENT_PLAN.md).

### ISSUE-4: Sprites jitter up and down relative to the ground
- **Status:** open
- **Reported:** 2026-10-03
- **Symptom:** Obstacles and other sprites sometimes jump up and down instead of moving smoothly with the road.
- **Hypotheses (unconfirmed):**
  - The fixed 60 Hz step runs 0, 1 or 2 times per rendered frame, so on high-refresh displays positions update unevenly. Fix by interpolating render positions, or by driving movement from the physics step instead.
  - Obstacle movement in `SpawnSystem` and the road scroll in `GameScene.step()` use fractional values that are rounded differently (sprites vs `tilePositionY`). Consider rounding both, or `roundPixels` in the game config.
  - Arcade physics runs on its own fixed step, separate from our step loop.
- **To do:** reproduce with `?debug` and the hitbox overlay (`0`), log sprite y per frame, and confirm which cause applies.
- **Plan:** WP-A0 and WP-A4 in [STANDARDS_ALIGNMENT_PLAN.md](STANDARDS_ALIGNMENT_PLAN.md); may share a cause with ISSUE-1 and be resolved by WP-B2.

## Closed

_None yet._
