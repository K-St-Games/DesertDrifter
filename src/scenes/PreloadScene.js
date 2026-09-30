import { ENTITIES } from '../entities.js';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
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
