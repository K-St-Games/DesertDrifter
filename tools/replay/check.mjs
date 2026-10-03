// WP-B6: replay check runner (node, no dependencies).
//
//   node tools/replay/check.mjs              replay + compare against golden.json
//   node tools/replay/check.mjs --regenerate rewrite golden.json from this run
//
// Exit code is 0 when every checkpoint matches, 1 on any mismatch (or when
// the scripted crash never lands). The golden file is the contract: a
// gameplay change (spawn weights, step timing, UFO timers, RNG order) moves
// snapshots and fails the check; see README.md for the deliberate-fail proof.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(here, 'golden.json');

const { runReplay, EXPECTED_CRASH_TICK } = await import('./harness.mjs');

function summarize(snapshotJson) {
  const s = JSON.parse(snapshotJson);
  return `tick=${s.tick} mode=${s.mode} score=${s.score} obstacles=${s.obstacles.length} ufo=${s.ufo.active ? s.ufo.state : 'idle'}(t${s.ufo.timerSteps}) car=(${s.car.x},${s.car.y}) rng=${s.rngState}`;
}

function loadGolden() {
  return JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
}

function regenerate() {
  const records = runReplay();
  const crash = records.find((r) => r.phase === 'crash');
  const golden = {
    note: 'WP-B6 replay golden: expected renderGameToText() snapshots. Regenerate with: node tools/replay/check.mjs --regenerate',
    seed: 'replay-b6',
    crashTick: crash.tick,
    records,
  };
  writeFileSync(GOLDEN_PATH, JSON.stringify(golden, null, 2) + '\n');
  console.log(`Regenerated ${GOLDEN_PATH}: ${records.length} checkpoints, crash at tick ${crash.tick}.`);
  for (const r of records) console.log(`  [golden] ${r.phase} tick=${r.tick} ${summarize(r.snapshot)}`);
}

function check() {
  let golden;
  try {
    golden = loadGolden();
  } catch (err) {
    console.error(`Cannot read golden file ${GOLDEN_PATH}: ${err.message}`);
    console.error('Generate it with: node tools/replay/check.mjs --regenerate');
    process.exitCode = 1;
    return;
  }
  const actual = runReplay();
  const expected = golden.records;
  let failures = 0;

  if (actual.length !== expected.length) {
    console.error(`FAIL: checkpoint count differs (golden ${expected.length}, actual ${actual.length})`);
    failures++;
  }
  const n = Math.min(actual.length, expected.length);
  for (let i = 0; i < n; i++) {
    const e = expected[i];
    const a = actual[i];
    const label = `${a.phase} tick=${a.tick}`;
    if (e.phase !== a.phase || e.tick !== a.tick) {
      console.error(`FAIL: checkpoint #${i} moved (golden ${e.phase}@${e.tick}, actual ${a.phase}@${a.tick})`);
      failures++;
      continue;
    }
    if (e.snapshot !== a.snapshot) {
      failures++;
      console.error(`FAIL: ${label} snapshot differs`);
      console.error(`  golden: ${summarize(e.snapshot)}`);
      console.error(`  actual: ${summarize(a.snapshot)}`);
      // Show the first differing top-level field to keep the output short.
      const eo = JSON.parse(e.snapshot);
      const ao = JSON.parse(a.snapshot);
      for (const key of Object.keys(eo)) {
        if (JSON.stringify(eo[key]) !== JSON.stringify(ao[key])) {
          console.error(`  field '${key}': golden=${JSON.stringify(eo[key])} actual=${JSON.stringify(ao[key])}`);
          break;
        }
      }
    } else {
      console.log(`  [pass] ${label} ${summarize(a.snapshot)}`);
    }
  }

  const crash = actual.find((r) => r.phase === 'crash');
  if (!crash.gameOver) {
    console.error('FAIL: scripted run never crashed (no game_over reached)');
    failures++;
  } else if (crash.tick !== EXPECTED_CRASH_TICK || crash.tick !== golden.crashTick) {
    console.error(`FAIL: crash at tick ${crash.tick}, expected ${EXPECTED_CRASH_TICK} (golden ${golden.crashTick})`);
    failures++;
  } else {
    const cs = JSON.parse(crash.snapshot);
    if (cs.mode !== 'game_over' || cs.ufo.state !== 'firing') {
      console.error(`FAIL: crash snapshot is not a firing-beam game_over: ${summarize(crash.snapshot)}`);
      failures++;
    }
  }

  if (failures > 0) {
    console.error(`REPLAY CHECK FAILED: ${failures} problem(s).`);
    process.exitCode = 1;
  } else {
    console.log(`REPLAY CHECK PASSED: ${n} checkpoints identical, crash at tick ${crash.tick}.`);
  }
}

if (process.argv.includes('--regenerate')) regenerate();
else check();
