#!/usr/bin/env node
// WP-A0 browser runner: drives the game with ?seed= and dumps the ?debug probe
// buffer (window.getMeasureBuffer) to JSON. No npm dependencies: uses Node's
// built-in fetch and WebSocket to talk to Chromium over CDP.
//
// Requires a Chromium/Chrome binary. If none is available in this environment,
// use simulate.mjs (deterministic Node-only fallback) instead.
//
// Usage:
//   node tools/measure/run_browser.mjs --url 'http://localhost:8080/?seed=abc&debug' \
//     --seconds 30 --out /tmp/opencode/measure_60hz.json [--throttle-fps 60] [--chrome /path/to/chrome]
//
// Serve the repo first: python3 -m http.server 8080   (plain server, NOT Live Server)

import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import net from 'node:net';

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const url = arg('url');
const seconds = Number(arg('seconds', '30'));
const out = arg('out');
const throttleFps = arg('throttle-fps') === null ? null : Number(arg('throttle-fps'));
let chromePath = arg('chrome', process.env.CHROME_PATH ?? null);
if (!url || !out || !Number.isFinite(seconds) || seconds <= 0) {
  console.error('usage: run_browser.mjs --url <http://...?seed=X&debug> --seconds N --out <file> [--throttle-fps 60] [--chrome <bin>]');
  process.exit(1);
}
if (!/[?&]debug/.test(url)) {
  console.error('refusing: url must include ?debug (the probe only records with ?debug)');
  process.exit(1);
}

function findChrome() {
  if (chromePath) return chromePath;
  const candidates = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  for (const c of candidates) {
    try {
      const r = c.includes('/') ? null : spawnSync('command', ['-v', c], { encoding: 'utf8' });
      if (c.includes('/') || (r.status === 0 && r.stdout.trim())) return c;
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

async function main() {
  const bin = findChrome();
  if (!bin) {
    console.error('no Chromium/Chrome binary found. Set --chrome or CHROME_PATH, or use the fallback:');
    console.error('  node tools/measure/simulate.mjs --cadence 60 --seconds 30 --out /tmp/opencode/measure_60hz.json');
    process.exit(2);
  }
  const port = await freePort();
  const args = [
    '--headless=new', `--remote-debugging-port=${port}`,
    '--no-first-run', '--no-default-browser-check', '--disable-hang-monitor',
    '--window-size=500,750', 'about:blank',
  ];
  try { if (typeof process.getuid === 'function' && process.getuid() === 0) args.push('--no-sandbox'); } catch { /* non-posix */ }
  const child = spawn(bin, args, { stdio: 'ignore' });
  const kill = () => { try { child.kill(); } catch { /* already gone */ } };
  process.on('exit', kill);
  process.on('SIGINT', () => { kill(); process.exit(130); });

  // Wait for the DevTools endpoint.
  let targets = null;
  for (let i = 0; i < 150; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (res.ok) { targets = await res.json(); break; }
    } catch { /* not up yet */ }
    await sleep(100);
  }
  if (!targets) { console.error('devtools endpoint did not come up'); kill(); process.exit(1); }
  const page = targets.find((t) => t.type === 'page');
  if (!page) { console.error('no page target'); kill(); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = (e) => reject(e); });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
    setTimeout(() => { if (pending.has(msgId)) { pending.delete(msgId); reject(new Error(`CDP timeout: ${method}`)); } }, 30000);
  });
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true });
    if (res.exceptionDetails) throw new Error(`page eval failed: ${JSON.stringify(res.exceptionDetails).slice(0, 500)}`);
    return res.result.value;
  };

  try {
    await send('Page.enable');
    await send('Runtime.enable');
    if (throttleFps !== null) {
      // Approximate a lower-refresh display: quantize rAF callbacks to the
      // target cadence. The game then sees ~16.7ms deltas at 60 fps.
      const gap = 1000 / throttleFps;
      await send('Page.addScriptToEvaluateOnNewDocument', {
        source: `(() => { const gap = ${gap}; let last = 0; const orig = window.requestAnimationFrame.bind(window);
          window.requestAnimationFrame = (cb) => orig((t) => { const now = performance.now();
            if (now - last >= gap) { last = now; cb(t); } else setTimeout(() => orig((tt) => { last = performance.now(); cb(tt); }), gap - (now - last)); }); })();`,
      });
    }
    await send('Page.navigate', { url });

    // Wait for the scene + probe.
    let ready = false;
    for (let i = 0; i < 300; i++) {
      await sleep(100);
      try { ready = await evaluate('!!window.getMeasureBuffer'); } catch { /* retry */ }
      if (ready) break;
    }
    if (!ready) throw new Error('probe not found after 30s: is the page served with ?debug and free of JS errors?');

    await sleep(seconds * 1000);
    const frames = await evaluate('window.getMeasureBuffer()');
    const seed = new URL(url).searchParams.get('seed');
    writeFileSync(out, JSON.stringify({
      meta: {
        mode: 'browser', url, seed, seconds, throttleFps,
        capturedFrames: Array.isArray(frames) ? frames.length : 0,
        note: 'Captured from the ?debug probe (window.getMeasureBuffer).',
      },
      frames,
    }) + '\n');
    console.log(`wrote ${Array.isArray(frames) ? frames.length : 0} frames to ${out}`);
  } finally {
    ws.close();
    kill();
  }
}

main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
