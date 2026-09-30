import { ROAD, TUNING } from '../config.js';
import { applyBehavior } from '../behaviors.js';
import { ENTITIES, spawnableIds } from '../entities.js';

// Obstacle spawning, movement and pass-by scoring. Behavior unchanged from the original game.js.
export class SpawnSystem {
  constructor(scene, { factory, isGameOver, onScore }) {
    this.scene = scene;
    this.factory = factory;
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
            const points = ENTITIES[child.texture.key].points ?? 0;
            this.onScore(points * multiplier);
          }
          child.destroy();
        }
      }
    });
  }

  spawnObstacle() {
    if (this.isGameOver()) return;

    const type = this.pickType();
    const def = ENTITIES[type];
    const obstacle = this.factory.createInGroup(this.group, type, this.pickX(def.spawnZone), -50);
    obstacle.scored = false;
    applyBehavior(obstacle, def.behavior);
  }

  // Weighted pick over entities with a positive spawnWeight
  pickType() {
    const ids = spawnableIds();
    const total = ids.reduce((sum, id) => sum + ENTITIES[id].spawnWeight, 0);
    let roll = Phaser.Math.Between(1, total);
    for (const id of ids) {
      roll -= ENTITIES[id].spawnWeight;
      if (roll <= 0) return id;
    }
    return ids[ids.length - 1];
  }

  pickX(zone) {
    if (zone === 'road') return Phaser.Math.Between(ROAD.left, ROAD.right);
    if (zone === 'desert') {
      // Left or right of the road
      const [lo, hi] = ROAD.treeZones[Phaser.Math.Between(0, 1)];
      return Phaser.Math.Between(lo, hi);
    }
    return Phaser.Math.Between(...ROAD.anywhere);
  }

  // Called when a run restarts
  clear() {
    this.group.clear(true, true);
  }
}
