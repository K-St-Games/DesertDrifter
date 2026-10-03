#!/usr/bin/env node
// WP-A0 summariser: road px/s, steps/frame distribution, and per-frame y-delta
// stats for road vs sprites. Accepts JSON from run_browser.mjs or simulate.mjs.
//
// Usage:
//   node tools/measure/summarise.mjs /tmp/opencode/measure_60hz.json [--json]

import { readFileSync } from 'node:fs';

const file = process.argv[2];
const asJson = process.argv.includes('--json');
if (!file) { console.error('usage: summarise.mjs <frames.json> [--json]'); process.exit(1); }
const doc = JSON.parse(readFileSync(file, 'utf8'));
const frames = doc.frames;
if (!Array.isArray(frames) || frames.length < 2) { console.error('need >= 2 frames'); process.exit(1); }

const first = frames[0];
const last = frames[frames.length - 1];
const durationS = (last.t - first.t) / 1000;
const stepsTotal = frames.reduce((s, f) => s + f.steps, 0);
const roadPx = first.roadY - last.roadY; // tilePositionY decreases as the road scrolls
const roadPxPerS = roadPx / durationS;
const pxPerStep = roadPx / stepsTotal;

const stepsHist = {};
for (const f of frames) stepsHist[f.steps] = (stepsHist[f.steps] ?? 0) + 1;

function stats(xs) {
  const n = xs.length;
  if (n === 0) return { n: 0, mean: 0, min: 0, max: 0, sd: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  return { n, mean, min: Math.min(...xs), max: Math.max(...xs), sd };
}

// Road scroll per rendered frame (px scrolled in that frame).
const roadDeltas = [];
for (let i = 1; i < frames.length; i++) roadDeltas.push(frames[i - 1].roadY - frames[i].roadY);

// Sprite y-deltas: match obstacles across consecutive frames by nearest (x, y).
// A delta spanning frame i reflects steps executed in frame i.
const spriteDeltas = [];
let outsideBand = 0; // WP-A4 band: sprite must move 0.5x..1.5x of expected for its steps
let matched = 0;
for (let i = 1; i < frames.length; i++) {
  const prev = frames[i - 1].obstacles;
  const cur = frames[i].obstacles;
  const used = new Set();
  for (const [px, py] of prev) {
    let best = -1;
    let bestD = 1e9;
    cur.forEach(([cx, cy], j) => {
      if (used.has(j)) return;
      const d = Math.hypot(cx - px, cy - py);
      if (d < bestD) { bestD = d; best = j; }
    });
    // Obstacles only move down, at most a few px per step.
    if (best >= 0 && bestD <= 8 && cur[best][1] >= py) {
      used.add(best);
      const dy = cur[best][1] - py;
      spriteDeltas.push(dy);
      matched++;
      const expected = frames[i].steps * pxPerStep;
      if (frames[i].steps > 0 && (dy < 0.5 * expected || dy > 1.5 * expected)) outsideBand++;
    }
  }
}

const result = {
  file,
  frames: frames.length,
  durationS: Math.round(durationS * 100) / 100,
  stepsTotal,
  stepsPerS: Math.round((stepsTotal / durationS) * 100) / 100,
  stepsPerFrame: stepsHist,
  roadPx: Math.round(roadPx * 10) / 10,
  roadPxPerS: Math.round(roadPxPerS * 100) / 100,
  pxPerStep: Math.round(pxPerStep * 1000) / 1000,
  roadDeltaPerFrame: stats(roadDeltas.map((v) => Math.round(v * 1000) / 1000)),
  spriteDeltaPerFrame: stats(spriteDeltas),
  spriteMatchedPairs: matched,
  spriteOutsideBand: outsideBand, // frames where a sprite moved <0.5x or >1.5x expected (WP-A4)
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const f2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
  console.log(`file:               ${result.file}`);
  console.log(`frames:             ${result.frames} over ${result.durationS}s`);
  console.log(`steps:              ${result.stepsTotal} total, ${result.stepsPerS}/s`);
  console.log(`steps/frame hist:   ${JSON.stringify(result.stepsPerFrame)}`);
  console.log(`road:               ${result.roadPx}px total, ${f2(result.roadPxPerS)} px/s (${result.pxPerStep} px/step)`);
  const rd = result.roadDeltaPerFrame;
  console.log(`road d/frame:       n=${rd.n} mean=${f2(rd.mean)} min=${f2(rd.min)} max=${f2(rd.max)} sd=${f2(rd.sd)}`);
  const sd = result.spriteDeltaPerFrame;
  console.log(`sprite dy/frame:    n=${result.spriteMatchedPairs} mean=${f2(sd.mean)} min=${f2(sd.min)} max=${f2(sd.max)} sd=${f2(sd.sd)}`);
  console.log(`sprite outside 0.5x-1.5x band: ${result.spriteOutsideBand}/${result.spriteMatchedPairs}`);
}
