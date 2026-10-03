import { ENTITIES, validateEntities } from '../entities.js';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    // Fail fast on a bad entity row before loading anything (WP-C2).
    // Runs inside preload so importing this module (e.g. in node tests) stays side-effect free.
    validateEntities();
    // Debug loading errors
    this.load.on('loaderror', function (file) {
      console.log('Error loading asset:', file.key);
    });

    this.load.image('road', 'assets/sprites/road.png');
    Object.entries(ENTITIES).forEach(([id, def]) => this.load.image(id, def.file));
  }

  create() {
    this.scene.start('GameScene');
  }
}
