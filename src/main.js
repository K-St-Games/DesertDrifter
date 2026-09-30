import { createGameConfig } from './config.js';
import { PreloadScene } from './scenes/PreloadScene.js';
import { GameScene } from './scenes/GameScene.js';
import { bindFullscreenButton } from './ui/fullscreen.js';

const game = new Phaser.Game(createGameConfig([PreloadScene, GameScene]));

bindFullscreenButton(document.getElementById('fullscreen-btn'));

// Dev-only handle for the browser console and test scripts: open the page with ?debug
if (new URLSearchParams(window.location.search).has('debug')) {
  window.game = game;
}
