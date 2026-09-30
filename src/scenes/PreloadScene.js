export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    // Debug loading errors
    this.load.on('loaderror', function (file) {
      console.log('Error loading asset:', file.key);
    });

    this.load.image('road', 'assets/road.png');
    this.load.image('car', 'assets/car.png');
    this.load.image('trailer', 'assets/trailer.png');
    this.load.image('tumbleweed', 'assets/tumbleweed.png');
    this.load.image('rock', 'assets/rock.png');
    this.load.image('turtle', 'assets/turtle.png');
    this.load.image('tree', 'assets/tree.png');
    this.load.image('ufo', 'assets/ufo.png');
  }

  create() {
    this.scene.start('GameScene');
  }
}
