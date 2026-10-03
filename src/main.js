import { createGameConfig } from './config.js';
import { PreloadScene } from './scenes/PreloadScene.js';
import { GameScene } from './scenes/GameScene.js';
import { bindFullscreenButton } from './ui/fullscreen.js';
import { readSeedParam } from './sim/rng.js';

// ?seed=<text> seeds the gameplay RNG only (src/sim/rng.js). Cosmetic HUD shake
// and the music start offset stay on Math.random, so audio load timing can
// never shift the gameplay sequence. Stashed here; GameScene reads it back in
// create(). Null when the flag is absent, so unseeded runs still vary.
if (typeof window !== 'undefined') {
  window.__DESERT_DRIFTER_SEED__ = readSeedParam();
}

const game = new Phaser.Game(createGameConfig([PreloadScene, GameScene]));

bindFullscreenButton(document.getElementById('fullscreen-btn'));

// Dev-only handle for the browser console and test scripts: open the page with ?debug
if (new URLSearchParams(window.location.search).has('debug')) {
  window.game = game;
}
