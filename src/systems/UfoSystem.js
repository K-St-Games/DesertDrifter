// The UFO boss: approach -> lock on -> charge (warning beam) -> fire (deadly beam), three attacks, then leave.
// Logic and timings are unchanged from the original game.js (frame-based timers).
import { UFO } from '../config.js';

export class UfoSystem {
  constructor(scene, { factory, onBeamHit }) {
    this.scene = scene;
    this.onBeamHit = onBeamHit;

    this.active = false;
    this.state = 'idle';
    this.timer = 0;
    this.hoverCount = 0;
    this.targetX = 0;
    this.targetY = 0;
    this.attackCount = 0;
    this.nextSpawnTime = 0;

    const ufo = factory.createSprite('ufo', -100, -100);
    ufo.setVisible(false);
    ufo.setDepth(20); // Top layer
    this.sprite = ufo;

    this.beam = scene.add.graphics();
    this.beam.setDepth(19);
  }

  update(score, car, gameOver) {
    const scene = this.scene;
    const ufo = this.sprite;
    const beam = this.beam;

    if (score >= UFO.scoreThreshold && !this.active && !gameOver) {
      // First time spawn check
      if (this.nextSpawnTime === 0) this.nextSpawnTime = scene.time.now;

      if (scene.time.now > this.nextSpawnTime) {
        this.active = true;
        this.state = 'approaching';
        ufo.setPosition(car.x, -100);
        ufo.setVisible(true);
        this.timer = 0;
        this.hoverCount = UFO.hovers;
        this.attackCount = 0;

        // Initial random target
        this.targetX = Phaser.Math.Between(100, 380);
        this.targetY = Phaser.Math.Between(100, 300);
      }
    }

    if (this.active && !gameOver) {
      if (this.state === 'approaching') {
        // Move to random target slowly
        ufo.x = Phaser.Math.Linear(ufo.x, this.targetX, 0.02);
        ufo.y = Phaser.Math.Linear(ufo.y, this.targetY, 0.02);

        ufo.angle = Math.sin(scene.time.now / 300) * 5; // Slow wobble

        if (Phaser.Math.Distance.Between(ufo.x, ufo.y, this.targetX, this.targetY) < 30) {
          // Reached target
          this.hoverCount--;
          if (this.hoverCount > 0) {
            // Pick new target
            this.targetX = Phaser.Math.Between(100, 380);
            this.targetY = Phaser.Math.Between(100, 300);
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
        if (scene.time.now % 200 < 100) { // Flicker effect
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
            this.targetX = Phaser.Math.Between(100, 380);
            this.targetY = Phaser.Math.Between(100, 300);
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
          // Return in 10-20 seconds
          this.nextSpawnTime = scene.time.now + Phaser.Math.Between(...UFO.respawnMs);
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
    this.nextSpawnTime = 0;
  }
}
