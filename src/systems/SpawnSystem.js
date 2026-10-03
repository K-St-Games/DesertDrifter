import { ROAD, TUNING } from '../config.js';
import { applyBehavior } from '../behaviors.js';
import { ENTITIES, spawnableIds } from '../entities.js';

// Obstacle spawning, movement and pass-by scoring. Behavior unchanged from the original game.js.
// All random draws use the shared gameplay RNG (owning scene passes it in),
// never Phaser.Math, so cosmetic/audio timing cannot shift the sequence.
export class SpawnSystem {
  constructor(scene, { factory, isGameOver, onScore, rng }) {
    this.scene = scene;
    this.factory = factory;
    this.isGameOver = isGameOver;
    this.onScore = onScore;
    this.rng = rng;
    this.group = scene.physics.add.group();
    this.nextSpawnTick = 0;
  }

  start(tick) {
    this.nextSpawnTick = tick + TUNING.firstSpawnDelaySteps;
  }

  // WP-B1: tick is the scene's gameplay clock (1 per step). Cooldowns freeze
  // while paused because the scene stops calling step(), so tick stops too.
  update(tick, currentSpeed, multiplier) {
    // --- Spawning Logic ---
    if (tick > this.nextSpawnTick) {
      this.spawnObstacle();
      // Spawn pacing is unchanged: base delay ms with +/-100 ms jitter, 300 ms
      // floor. Converted once to integer steps (round(ms / stepMs)).
      const delayMs = (1500 / (currentSpeed * 0.8)) + this.rng.int(-100, 100);
      const delaySteps = Math.max(
        Math.round(300 / TUNING.stepMs),
        Math.round(delayMs / TUNING.stepMs),
      );
      this.nextSpawnTick = tick + delaySteps;
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
    applyBehavior(obstacle, def.behavior, this.rng);
  }

  // Weighted pick over entities with a positive spawnWeight
  pickType() {
    const ids = spawnableIds();
    const total = ids.reduce((sum, id) => sum + ENTITIES[id].spawnWeight, 0);
    let roll = this.rng.int(1, total);
    for (const id of ids) {
      roll -= ENTITIES[id].spawnWeight;
      if (roll <= 0) return id;
    }
    return ids[ids.length - 1];
  }

  pickX(zone) {
    if (zone === 'road') return this.rng.int(ROAD.left, ROAD.right);
    if (zone === 'desert') {
      // Left or right of the road
      const [lo, hi] = ROAD.treeZones[this.rng.int(0, 1)];
      return this.rng.int(lo, hi);
    }
    return this.rng.int(...ROAD.anywhere);
  }

  // Called when a run restarts
  clear() {
    this.group.clear(true, true);
  }
}
