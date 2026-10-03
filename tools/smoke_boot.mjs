#!/usr/bin/env node
// Boot smoke check for DesertDrifter: serves the repo with Cache-Control:
// no-store (browsers cache ES modules, so a stale copy would mislead you),
// loads the page in headless Chromium against real Phaser 3.90.0 from the
// CDN, and fails on ANY console error or uncaught exception.
//
// No npm dependencies: Node built-ins only (http, child_process, net, plus
// global fetch and WebSocket, as in tools/measure/run_browser.mjs).
//
// Usage:
//   node tools/smoke_boot.mjs [--dir .] [--seed smoke] [--steps 120]
//     [--check-steer] [--chrome /path/to/chrome]
//
//   --steps N       manual game.step() frames to run after boot (default 120)
//   --check-steer   hold ArrowRight for 60 ticks with spawning disabled and
//                   assert the car moves >= 190 px (WP-A4 steering acceptance)
//   exit 0 pass, 1 fail, 2 no Chromium/Chrome binary (set --chrome/CHROME_PATH)
//
// Added for WP-B2 review: create() used to call
// this.physics.world.disableUpdate(), which does not exist (it lives on
// ArcadePhysics), crashing boot. Only a real-Phaser boot catches that class
// of bug; the node unit tests use a fake world.

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const dir = path.resolve(arg('dir', '.'));
const seed = arg('seed', 'smoke');
const steps = Math.max(1, Number(arg('steps', '120')) || 120);
const checkSteer = process.argv.includes('--check-steer');
const chromePath = arg('chrome', process.env.CHROME_PATH ?? null);

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg',
  '.css': 'text/css', '.hex': 'text/plain',
};

function findChrome() {
  if (chromePath) return chromePath;
  const candidates = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'chrome'];
  for (const c of candidates) {
    try {
      const r = spawnSync('command', ['-v', c], { encoding: 'utf8' });
      if (r.status === 0 && r.stdout.trim()) return c;
    } catch { /* try next */ }
  }
  return null;
}

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serveNoStore(root) {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
      if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
      const data = await readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Cache-Control': 'no-store' });
      res.end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function main() {
  const bin = findChrome();
  if (!bin) {
    console.error('smoke_boot: no Chromium/Chrome binary found (set --chrome or CHROME_PATH)');
    process.exit(2);
  }
  if (typeof WebSocket === 'undefined') {
    console.error('smoke_boot: global WebSocket unavailable (needs Node 21+)');
    process.exit(2);
  }
  const { server, port: servePort } = await serveNoStore(dir);
  const url = `http://127.0.0.1:${servePort}/?seed=${encodeURIComponent(seed)}&debug`;
  const dbgPort = await freePort();
  const args = [
    '--headless=new', `--remote-debugging-port=${dbgPort}`,
    '--no-first-run', '--no-default-browser-check', '--disable-hang-monitor',
    '--window-size=500,750', 'about:blank',
  ];
  try { if (typeof process.getuid === 'function' && process.getuid() === 0) args.push('--no-sandbox'); } catch { /* non-posix */ }
  const child = spawn(bin, args, { stdio: 'ignore' });
  const kill = () => { try { child.kill(); } catch { /* already gone */ } };
  process.on('exit', () => { kill(); server.close(); });
  process.on('SIGINT', () => { kill(); process.exit(130); });

  let failures = [];
  try {
    let targets = null;
    for (let i = 0; i < 150; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${dbgPort}/json/list`);
        if (res.ok) { targets = await res.json(); break; }
      } catch { /* not up yet */ }
      await sleep(100);
    }
    if (!targets) throw new Error('devtools endpoint did not come up');
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('no page target');

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('cdp connect failed')); });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        failures.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 400)}`);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        failures.push(`exception: ${JSON.stringify(msg.params.exceptionDetails).slice(0, 400)}`);
      } else if (msg.method === 'Log.entryAdded' && ['error'].includes(msg.params.entry.level)) {
        failures.push(`log.error: ${(msg.params.entry.text ?? '').slice(0, 400)}`);
      }
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
      setTimeout(() => { if (pending.has(msgId)) { pending.delete(msgId); reject(new Error(`CDP timeout: ${method}`)); } }, 30000);
    });
    const evaluate = async (expression) => {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (res.exceptionDetails) throw new Error(`page eval failed: ${JSON.stringify(res.exceptionDetails).slice(0, 500)}`);
      return res.result.value;
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.navigate', { url });

    // Wait for GameScene: drive frames manually in-page (a hidden/minimized
    // page pauses rAF, so never rely on it here).
    let booted = null;
    for (let i = 0; i < 120; i++) {
      await sleep(500);
      booted = await evaluate(`(() => {
        if (!window.game) return null;
        const g = window.game;
        let t = performance.now();
        for (let k = 0; k < 10; k++) { t += 16.666; g.step(t, 16.666); }
        const active = g.scene.getScenes(true).map(s => s.scene.key);
        return { active, tick: active.includes('GameScene') ? g.scene.getScene('GameScene').tick : -1,
          render: typeof window.render_game_to_text };
      })()`);
      if (booted && booted.active.includes('GameScene')) break;
    }
    if (!booted || !booted.active.includes('GameScene')) {
      failures.push(`GameScene never activated (last: ${JSON.stringify(booted)})`);
    } else {
      console.log(`boot ok: scenes=${booted.active} tick=${booted.tick} render=${booted.render}`);
      const extra = await evaluate(`(() => {
        const g = window.game; const s = g.scene.getScene('GameScene');
        let t = performance.now();
        for (let k = 0; k < ${steps}; k++) { t += 16.666; g.step(t, 16.666); }
        const out = { tick: s.tick, score: s.score, carX: Math.round(s.car.x * 10) / 10 };
        if (${checkSteer ? 'true' : 'false'}) {
          s.spawner.nextSpawnTick = 1e9; s.spawner.nextSpawnTime = 1e9; // disable spawning for the steering probe
          const x0 = s.car.x;
          // Phaser's KeyboardPlugin keys off event.keyCode, so the synthetic
          // events must carry it (key/code alone do not register as held).
          const kd = { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, which: 39, bubbles: true };
          const down = new KeyboardEvent('keydown', kd);
          window.dispatchEvent(down); document.dispatchEvent(down);
          for (let k = 0; k < 60; k++) { t += 16.666; g.step(t, 16.666); }
          const up = new KeyboardEvent('keyup', { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, which: 39, bubbles: true });
          window.dispatchEvent(up); document.dispatchEvent(up);
          out.steerDx = Math.round((s.car.x - x0) * 10) / 10;
        }
        return out;
      })()`);
      console.log(`drove ${steps} steps: ${JSON.stringify(extra)}`);
      if (!(extra.tick > 0)) failures.push('tick did not advance while driving frames');
      if (checkSteer && !(extra.steerDx >= 190)) {
        failures.push(`steering probe: 60 ticks held-right moved ${extra.steerDx} px, need >= 190`);
      }
    }
    ws.close();
  } catch (e) {
    failures.push(`harness: ${e.message}`);
  }
  kill();
  server.close();
  if (failures.length) {
    console.error(`SMOKE FAILED:\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('SMOKE PASSED: no console errors, GameScene boots and steps');
}
await main();
