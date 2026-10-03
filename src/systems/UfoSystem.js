// The UFO boss: approach -> lock on -> charge (warning beam) -> fire (deadly beam), three attacks, then leave.
// Logic and timings are unchanged from the original game.js (frame-based timers).
import { TUNING, UFO } from '../config.js';

export class UfoSystem {
  constructor(scene, { factory, onBeamHit, rng }) {
    this.scene = scene;
    this.onBeamHit = onBeamHit;
    // Shared gameplay RNG (owning scene passes it in); UFO target picks draw
    // from the same stream as spawning, in call order.
    this.rng = rng;

    this.active = false;
    this.state = 'idle';
    this.timer = 0;
    this.hoverCount = 0;
    this.targetX = 0;
    this.targetY = 0;
    this.attackCount = 0;
    this.nextSpawnTick = 0;

    const ufo = factory.createSprite('ufo', -100, -100);
    ufo.setVisible(false);
    ufo.setDepth(20); // Top layer
    this.sprite = ufo;

    this.beam = scene.add.graphics();
    this.beam.setDepth(19);
  }

  // WP-B1: tick is the scene's gameplay clock (1 per step). Spawn, respawn,
  // flicker and wobble all run on tick so pausing (tick freeze) suspends them
  // and 60 Hz / 120 Hz+ displays behave identically.
  update(tick, score, car, gameOver) {
    const ufo = this.sprite;
    const beam = this.beam;

    if (score >= UFO.scoreThreshold && !this.active && !gameOver) {
      // First time spawn check
      // Zero means the first spawn has not been scheduled yet (tick only
      // equals 0 on the very first step, where tick > 0 is still false).
      if (this.nextSpawnTick === 0) this.nextSpawnTick = tick;

      if (tick > this.nextSpawnTick) {
        this.active = true;
        this.state = 'approaching';
        ufo.setPosition(car.x, -100);
        ufo.setVisible(true);
        this.timer = 0;
        this.hoverCount = UFO.hovers;
        this.attackCount = 0;

        // Initial random target
        this.targetX = this.rng.int(100, 380);
        this.targetY = this.rng.int(100, 300);
      }
    }

    if (this.active && !gameOver) {
      if (this.state === 'approaching' || this.state === 'locking') {
        beam.clear(); // the previous shot's beam is only redrawn while charging/firing
      }

      if (this.state === 'approaching') {
        // Move to random target slowly
        ufo.x = Phaser.Math.Linear(ufo.x, this.targetX, 0.02);
        ufo.y = Phaser.Math.Linear(ufo.y, this.targetY, 0.02);

        // Slow wobble: cosmetic, but driven by tick for determinism
        // (was sin(time.now / 300); tick * stepMs elapses the same ms).
        ufo.angle = Math.sin((tick * TUNING.stepMs) / 300) * 5;

        if (Phaser.Math.Distance.Between(ufo.x, ufo.y, this.targetX, this.targetY) < 30) {
          // Reached target
          this.hoverCount--;
          if (this.hoverCount > 0) {
            // Pick new target
            this.targetX = this.rng.int(100, 380);
            this.targetY = this.rng.int(100, 300);
          } else {
            this.state = 'locking';
          }
        }
      } else if (this.state === 'locking') {
        // Move to above car
        const targetX = car.x;
        const targetY = car.y - 200;

        ufo.x = Phaser.Math.Linear(ufo.x, targetX, 0.05);
        ufo.y = Phaser.Math.Linear(ufo.y, targetY, 0.05);

        if (Phaser.Math.Distance.Between(ufo.x, ufo.y, targetX, targetY) < 10) {
          this.state = 'charging';
          this.timer = 0;
        }
      } else if (this.state === 'charging') {
        // 3 Second Warning (Yellow Beam)
        this.timer++;

        beam.clear();
        // Flicker: beam visible for the first half of each 12-step (200 ms) period.
        if (tick % UFO.flickerPeriodSteps < UFO.flickerOnSteps) {
          beam.fillStyle(0xffff00, 0.3); // Yellow
          beam.beginPath();
          beam.moveTo(ufo.x, ufo.y + 20);
          beam.lineTo(ufo.x - UFO.beamHalfWidth, 700);
          beam.lineTo(ufo.x + UFO.beamHalfWidth, 700);
          beam.closePath();
          beam.fillPath();
        }

        if (this.timer > UFO.chargeSteps) { // 3 seconds
          this.state = 'firing';
          this.timer = 0;
        }
      } else if (this.state === 'firing') {
        // Deadly Beam (Green)
        this.timer++;

        beam.clear();
        beam.fillStyle(0x00ff00, 0.6); // Green
        beam.beginPath();
        beam.moveTo(ufo.x, ufo.y + 20);
        beam.lineTo(ufo.x - UFO.beamHalfWidth, 700);
        beam.lineTo(ufo.x + UFO.beamHalfWidth, 700);
        beam.closePath();
        beam.fillPath();

        // Check Collision
        if (car.x > ufo.x - UFO.beamHalfWidth && car.x < ufo.x + UFO.beamHalfWidth) {
          this.onBeamHit(car, ufo);
        }

        if (this.timer > UFO.fireSteps) { // 1 second
          this.attackCount++;
          if (this.attackCount < UFO.attacks) {
            // Try again
            this.state = 'approaching';
            this.hoverCount = UFO.hovers;
            this.timer = 0;
            // Pick new target immediately
            this.targetX = this.rng.int(100, 380);
            this.targetY = this.rng.int(100, 300);
          } else {
            // Done, leave
            this.state = 'leaving';
          }
        }
      } else if (this.state === 'leaving') {
        ufo.y -= 3;
        beam.clear();
        if (ufo.y < -100) {
          this.active = false;
          ufo.setVisible(false);
          this.state = 'idle';
          // Return in 10-20 seconds (600-1200 steps)
          this.nextSpawnTick = tick + this.rng.int(...UFO.respawnSteps);
        }
      }
    } else {
      beam.clear();
    }
  }

  // Called when a run restarts
  reset() {
    this.active = false;
    this.sprite.setVisible(false);
    this.beam.clear();
    this.state = 'idle';
    this.timer = 0;
    this.nextSpawnTick = 0;
  }
}
