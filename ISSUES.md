# Issues

Open problems and improvements. Add new items at the bottom of the open list; move finished ones to "Closed" with the PR that fixed them.

Status: `open` | `investigating` | `closed`

## Open

_None. The four launch issues below all closed with the PR #9–#22 stack (merged 2026-10-03)._

## Closed

### ISSUE-1: Game feels slower than the original
- **Status:** closed
- **Reported:** 2026-10-03
- **Fixed in:** PR #14 (WP-A3) with measurement from PR #11 (WP-A0); merged 2026-10-03
- **Symptom:** Overall game speed is lower than the original fork.
- **Reopened note (2026-10-03):** playtest on a ~120 Hz display: "speed is still way too slow". Superseded the resolution below: `TUNING.scrollFactor` 2 -> 4 (branch `fix/speed-2x`), matching the original on a 120 Hz display. Pending owner confirmation, then re-close.
- **Resolution (owner decision D1, superseded):** keep the 60 Hz pace — no `baseSpeed`/`speedIncrement` change. The original advanced the road once per rendered frame, so on a 120 Hz display it ran at 2x speed; this build runs the same 60 steps/s on every display.
- **Measurement (WP-A3):** analytic 30 s neutral: 2*sum(1+0.0001*k, k=1..1800) = 3924.2 px → 130.8 px/s; WP-A0 `simulate.mjs` reports 130.81 px/s at 60 Hz vs 130.84 px/s at 120 Hz (within 0.1%; target: 2%). Difficulty re-check: spawn delay `(1500/(speed*0.8))±100` (min 300 ms) tightens as speed rises, so raising the base speed would also spawn obstacles faster — left unchanged per D1, no balance change.
- **Plan:** WP-A0 and WP-A3 in [STANDARDS_ALIGNMENT_PLAN.md](STANDARDS_ALIGNMENT_PLAN.md); needed owner decision D1 (answered: keep 60 Hz).

### ISSUE-2: Road centre lines should be yellow
- **Status:** closed
- **Reported:** 2026-10-03
- **Fixed in:** PR #12 (WP-A1); merged 2026-10-03
- **Symptom:** The dashes in the middle of the road are not yellow.
- **Resolution (owner decision D2):** added a real palette yellow `e8c32a` (hue ~48°) in place of the near-unused slot 0 (`000000`, 3 armadillo pixels); dashes recoloured exactly and all sprites rebaked. Only the road (dashes) and 3 armadillo pixels changed; every other sprite is pixel-identical. Verified in-browser: decoded dash pixels exactly (232,195,42), live canvas shows vivid-yellow centre dashes.
- **Plan:** WP-A1 in [STANDARDS_ALIGNMENT_PLAN.md](STANDARDS_ALIGNMENT_PLAN.md); needed owner decision D2 (answered: add a proper yellow).

### ISSUE-3: Road lines do not tile seamlessly
- **Status:** closed
- **Reported:** 2026-10-03
- **Fixed in:** PR #13 (WP-A2, stacked on #12); merged 2026-10-03
- **Symptom:** The dashed lines don't line up where the road texture repeats. The original has the same flaw; `HiOrbit_redux` fixed it.
- **Resolution:** cropped `art/source/road.png` rows 20..1018 (1024x1024 → 1024x999 = exactly 16 dash cycles at ~62.44 px period) with identical first/last rows; rebaked. Baked seam-row diff is 0; scrolling ~1700 px across two wrap points in-browser shows steady dash counts with zero console errors.
- **Plan:** WP-A2 in [STANDARDS_ALIGNMENT_PLAN.md](STANDARDS_ALIGNMENT_PLAN.md).

### ISSUE-4: Sprites jitter up and down relative to the ground
- **Status:** closed
- **Reported:** 2026-10-03
- **Fixed in:** PR #19 (WP-A4, stacked on #18) with groundwork in PR #16 (WP-B2); merged 2026-10-03
- **Symptom:** Obstacles and other sprites sometimes jump up and down instead of moving smoothly with the road.
- **Root cause (proven, was hypothesis b):** the fixed 60 Hz step runs 0, 1 or 2 times per rendered frame, so on high-refresh displays on-screen motion alternated 0/~2.2 px. Fixed by display-only render interpolation between the last two sim states; collisions still resolve on exact sim positions. WP-B2 also moved Arcade physics onto the gameplay step (plus a review fix syncing bodies inside the step via `world.postUpdate()`).
- **Verification:** WP-A0 probe reports 0/238 frames outside the 0.5x–1.5x band at 60, 120 and 144 Hz emulated cadence; 60 held-right ticks move the car exactly 240 → 440; replay golden holds (crash tick 2996 on current `main`).
- **Plan:** WP-A0 and WP-A4 in [STANDARDS_ALIGNMENT_PLAN.md](STANDARDS_ALIGNMENT_PLAN.md).
