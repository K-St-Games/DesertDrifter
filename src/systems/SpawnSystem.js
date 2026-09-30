import { ROAD, TUNING } from '../config.js';

// Obstacle spawning, movement and pass-by scoring. Behavior unchanged from the original game.js.
export class SpawnSystem {
  constructor(scene, { isGameOver, onScore }) {
    this.scene = scene;
    this.isGameOver = isGameOver;
    this.onScore = onScore;
    this.group = scene.physics.add.group();
    this.nextSpawnTime = 0;
  }

  start() {
    this.nextSpawnTime = this.scene.time.now + TUNING.firstSpawnDelayMs;
  }

  update(currentSpeed, multiplier) {
    const scene = this.scene;

    // --- Spawning Logic ---
    if (scene.time.now > this.nextSpawnTime) {
      this.spawnObstacle();
      let delay = (1500 / (currentSpeed * 0.8)) + Phaser.Math.Between(-100, 100);
      if (delay < 300) delay = 300;
      this.nextSpawnTime = scene.time.now + delay;
    }

    // --- Move Obstacles ---
    this.group.children.iterate((child) => {
      if (child && child.active) {
        child.y += currentSpeed * 2; // Match road scrolling speed

        if (child.y > 700) {
          if (!child.scored) {
            child.scored = true;
            let points = 0;
            if (child.texture.key === 'rock' || child.texture.key === 'tree') {
              points = 100;
            } else if (child.texture.key === 'turtle') {
              points = 200;
            } else {
              points = 50;
            }
            this.onScore(points * multiplier);
          }
          child.destroy();
        }
      }
    });
  }

  spawnObstacle() {
    if (this.isGameOver()) return;

    // Randomize between types with weights
    // Tumbleweed: 35%
    // Rock: 30%
    // Tree: 25%
    // Turtle: 10% (Rare)
    const rand = Phaser.Math.Between(0, 99);
    let type, x;

    if (rand < 35) {
      type = 'tumbleweed';
      x = Phaser.Math.Between(...ROAD.anywhere); // Anywhere
    } else if (rand < 65) {
      type = 'rock';
      x = Phaser.Math.Between(ROAD.left, ROAD.right); // Road only
    } else if (rand < 90) {
      type = 'tree';
      // Desert only (Left or Right of road)
      if (Phaser.Math.Between(0, 1) === 0) {
        x = Phaser.Math.Between(...ROAD.treeZones[0]); // Left desert
      } else {
        x = Phaser.Math.Between(...ROAD.treeZones[1]); // Right desert
      }
    } else {
      type = 'turtle';
      x = Phaser.Math.Between(ROAD.left, ROAD.right); // Road only
    }

    const obstacle = this.group.create(x, -50, type);
    obstacle.scored = false;

    // 1. Scale & Size
    if (type === 'tree') {
      obstacle.setScale(0.15);
      obstacle.body.setSize(obstacle.width * 0.3, obstacle.height * 0.3);
      obstacle.body.setOffset(obstacle.width * 0.35, obstacle.height * 0.6); // Trunk only
    } else if (type === 'turtle') {
      obstacle.setScale(0.06);
      obstacle.body.setCircle(obstacle.width * 0.25);
    } else if (type === 'tumbleweed') {
      obstacle.setScale(0.08);
      obstacle.body.setCircle(obstacle.width * 0.3);
    } else { // Rock
      obstacle.setScale(0.05);
      obstacle.body.setSize(obstacle.width * 0.7, obstacle.height * 0.6);
    }

    // 2. Movement
    if (type === 'tumbleweed') {
      const direction = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
      const moveSpeed = Phaser.Math.Between(30, 80);

      obstacle.setVelocityX(moveSpeed * direction);
      obstacle.setAngularVelocity(Phaser.Math.Between(100, 300) * direction);
    } else if (type === 'turtle') {
      // Turtles crawl slowly
      const direction = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
      obstacle.setVelocityX(10 * direction);
    } else {
      // Static obstacles
      obstacle.setVelocityX(0);
    }
  }

  // Called when a run restarts
  clear() {
    this.group.clear(true, true);
  }
}
