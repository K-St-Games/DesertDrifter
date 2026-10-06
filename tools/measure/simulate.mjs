#!/usr/bin/env node
// WP-A0 deterministic fallback: replicates GameScene/SpawnSystem step math in
// Node when no headless browser is available. Neutral input (no boost/brake),
// one synthetic obstacle, same fixed-step accumulator as GameScene.update().
//
// Usage:
//   node tools/measure/simulate.mjs --cadence 60 --seconds 30 --out /tmp/opencode/measure_60hz.json
//
// Output schema matches run_browser.mjs so summarise.mjs accepts either:
//   { "meta": {...}, "frames": [{ t, steps, roadY, carX, obstacles: [[x, y], ...] }] }

import { writeFileSync } from 'node:fs';
import { TUNING } from '../../src/config.js';

function parseArgs(argv) {
  const out = { cadence: 60, seconds: 30, out: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--cadence') out.cadence = Number(argv[++i]);
    else if (argv[i] === '--seconds') out.seconds = Number(argv[++i]);
    else if (argv[i] === '--out') out.out = argv[++i];
    else { console.error(`unknown arg: ${argv[i]}`); process.exit(1); }
  }
  return out;
}

const { cadence, seconds, out } = parseArgs(process.argv);
if (!Number.isFinite(cadence) || cadence <= 0 || !Number.isFinite(seconds) || seconds <= 0) {
  console.error('cadence and seconds must be positive numbers');
  process.exit(1);
}

const r = (v) => Math.round(v * 10) / 10;
const stepMs = TUNING.stepMs;
const delta = 1000 / cadence;
const totalFrames = Math.round(seconds * cadence);

let speed = TUNING.baseSpeed;
let roadY = 0;
let acc = 0;
let t = 0;
let stepsTotal = 0;
let obstacle = null; // { x, y } once "spawned" after firstSpawnDelaySteps
const frames = [];

for (let f = 0; f < totalFrames; f++) {
  t += delta;
  // Same accumulator as GameScene.update (neutral input: currentSpeed = speed).
  acc += Math.min(delta, TUNING.maxFrameMs);
  let steps = 0;
  while (acc >= stepMs) {
    acc -= stepMs;
    steps++;
    stepsTotal++;
    speed = Math.min(speed + TUNING.speedIncrement, TUNING.maxBaseSpeed);
    roadY -= speed * TUNING.scrollFactor;
    if (stepsTotal > TUNING.firstSpawnDelaySteps && obstacle === null) obstacle = { x: 240, y: -50 };
    if (obstacle !== null) obstacle.y += speed * TUNING.scrollFactor; // SpawnSystem.update: child.y += currentSpeed * TUNING.scrollFactor
  }
  frames.push({
    t: Math.round(t),
    steps,
    roadY: r(roadY),
    carX: 240,
    obstacles: obstacle === null ? [] : [[240, r(obstacle.y)]],
  });
}

const doc = {
  meta: {
    mode: 'simulate-neutral',
    cadenceHz: cadence,
    seconds,
    stepsTotal,
    tuning: {
      stepMs: TUNING.stepMs,
      baseSpeed: TUNING.baseSpeed,
      speedIncrement: TUNING.speedIncrement,
      maxBaseSpeed: TUNING.maxBaseSpeed,
    },
    note: 'Node-only fallback: replicates road/obstacle step math with neutral input. No physics, RNG, UFO, or rendering.',
  },
  frames,
};

const json = JSON.stringify(doc);
if (out) writeFileSync(out, json + '\n');
else process.stdout.write(json + '\n');
