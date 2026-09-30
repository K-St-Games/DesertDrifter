import { createGameConfig } from './config.js';
import { PreloadScene } from './scenes/PreloadScene.js';
import { GameScene } from './scenes/GameScene.js';
import { bindFullscreenButton } from './ui/fullscreen.js';

// ?seed=<text> makes runs repeatable: Phaser's Between/FloatBetween use Math.random, so replace it.
const seed = new URLSearchParams(window.location.search).get('seed');
if (seed !== null) {
  let a = 0;
  for (const c of seed) a = (a * 31 + c.charCodeAt(0)) >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const game = new Phaser.Game(createGameConfig([PreloadScene, GameScene]));

bindFullscreenButton(document.getElementById('fullscreen-btn'));

// Dev-only handle for the browser console and test scripts: open the page with ?debug
if (new URLSearchParams(window.location.search).has('debug')) {
  window.game = game;
}
