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
    this.load.image('car', 'assets/sprites/car.png');
    this.load.image('trailer', 'assets/sprites/trailer.png');
    this.load.image('tumbleweed', 'assets/sprites/tumbleweed.png');
    this.load.image('rock', 'assets/sprites/rock.png');
    this.load.image('turtle', 'assets/sprites/turtle.png');
    this.load.image('tree', 'assets/sprites/tree.png');
    this.load.image('ufo', 'assets/sprites/ufo.png');
  }

  create() {
    this.scene.start('GameScene');
  }
}
