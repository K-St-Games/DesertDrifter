import { ROAD, TUNING } from '../config.js';
import { AudioManager } from '../audio/AudioManager.js';
import { Controls } from '../input/Controls.js';
import { HighScoreManager } from '../managers/HighScoreManager.js';
import { SpawnSystem } from '../systems/SpawnSystem.js';
import { UfoSystem } from '../systems/UfoSystem.js';
import { HighScoreForm } from '../ui/HighScoreForm.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    this.speed = TUNING.baseSpeed;
    this.score = 0;
    this.gameOver = false;
    this.gameOverAt = 0;
    this.stepAccumulator = 0;

    // Load High Scores
    this.highScoreManager = new HighScoreManager();

    // 1. Audio
    // Create procedural engine sound (Web Audio API)
    this.audio = new AudioManager();
    this.audio.init();

    // Music (23 MB) loads in the background so it never blocks the start of the game.
    this.load.audio('bgm', 'assets/audio/8bit_radio.mp3');
    this.load.once('complete', () => {
      if (!this.cache.audio.exists('bgm')) return;
      const music = this.sound.add('bgm', { loop: true, volume: 0.5 });
      // Increased randomization to 660 seconds (11 minutes)
      const randomStart = Phaser.Math.FloatBetween(0, 660);
      music.play({ seek: randomStart });
    });
    this.load.start();

    // 2. Road
    this.road = this.add.tileSprite(240, 320, 480, 640, 'road');
    this.road.setTileScale(1.0);
    this.road.tilePositionX += ROAD.tilePositionX;

    // 2. Groups
    this.spawner = new SpawnSystem(this, {
      isGameOver: () => this.gameOver,
      onScore: (points) => {
        this.score += points;

        // Pulse effect on score text
        this.tweens.add({
          targets: this.scoreText,
          scale: 1.2,
          duration: 100,
          yoyo: true,
          ease: 'Power1',
        });
      },
    });

    // 3. Trailer
    this.trailer = this.physics.add.sprite(240, 500, 'trailer');
    this.trailer.body.setSize(this.trailer.width * 0.5, this.trailer.height * 0.5);

    // 4. Car
    this.car = this.physics.add.sprite(240, 400, 'car');
    this.car.body.setSize(this.car.width * 0.5, this.car.height * 0.6);
    this.car.setCollideWorldBounds(true);

    // 5. Controls
    this.controls = new Controls(this);

    // 6. UI
    this.scoreText = this.add.text(16, 16, 'Score: 0', {
      fontSize: '20px',
      fill: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    });

    this.multiplierText = this.add.text(16, 46, '', {
      fontSize: '18px',
      fill: '#ffd700',
      stroke: '#000000',
      strokeThickness: 4,
      fontStyle: 'bold',
    });

    this.highScoreText = this.add.text(240, 200, '', {
      fontSize: '18px',
      fill: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
      align: 'center',
    });
    this.highScoreText.setOrigin(0.5);
    this.highScoreText.setVisible(false);

    this.spawner.start();

    // 8. Collisions
    this.physics.add.overlap(this.car, this.spawner.group, this.hitObstacle, null, this);
    this.physics.add.overlap(this.trailer, this.spawner.group, this.hitObstacle, null, this);

    // 9. UFO
    this.ufo = new UfoSystem(this, {
      onBeamHit: (car, ufoSprite) => this.hitObstacle(car, ufoSprite),
    });

    // High score entry form (DOM)
    this.form = new HighScoreForm({
      onSubmit: (rawInitials) => {
        if (this.highScoreManager.submit(rawInitials, this.score)) {
          this.form.hide();
          this.showGameOverScreen();
        }
      },
      onSkip: () => {
        this.form.hide();
        this.showGameOverScreen();
      },
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.form.destroy());
  }

  update(time, delta) {
    if (this.controls.muteJustPressed()) {
      const muted = this.audio.toggleMute();
      this.sound.mute = muted;
    }

    if (this.gameOver) {
      // Only allow restart if NOT showing input form, and not straight after the crash
      if (!this.form.isVisible() && this.time.now - this.gameOverAt > TUNING.restartLockoutMs) {
        if (this.controls.restartRequested()) {
          this.restartGame();
        }
      }
      return;
    }

    // Fixed-step simulation: identical speed on 60, 120 and 144 Hz displays.
    this.stepAccumulator += Math.min(delta, TUNING.maxFrameMs);
    while (this.stepAccumulator >= TUNING.stepMs && !this.gameOver) {
      this.stepAccumulator -= TUNING.stepMs;
      this.step();
    }
  }

  step() {
    // Base speed creeps up during a run
    this.speed = Math.min(this.speed + TUNING.speedIncrement, TUNING.maxBaseSpeed);

    // --- 1. Scroll Road ---
    let currentSpeed = this.speed;

    currentSpeed += this.controls.speedDelta();

    if (currentSpeed < 0.5) currentSpeed = 0.5;
    if (currentSpeed > 3) currentSpeed = 3;

    // Update engine pitch based on speed
    this.audio.updateEngineSpeed(currentSpeed);

    // Update UFO Sound
    this.audio.updateUfo(this.ufo.active && !this.gameOver, this.ufo.state);

    this.road.tilePositionY -= currentSpeed * 2;

    // Multiplier
    let multiplier = 1;
    if (currentSpeed >= 2) multiplier = 2;

    this.scoreText.setText('Score: ' + this.score);

    if (multiplier > 1) {
      this.multiplierText.setVisible(true);
      this.multiplierText.setText('MULTIPLIER x2!');
      this.multiplierText.setStyle({ fill: '#ffd700' });
      this.multiplierText.x = 16 + Phaser.Math.Between(-1, 1);
      this.multiplierText.y = 46 + Phaser.Math.Between(-1, 1);
    } else {
      this.multiplierText.setVisible(false);
    }

    // --- 2. Car Movement ---
    this.car.setVelocity(0);
    const { left: moveLeft, right: moveRight } = this.controls.steer();

    if (moveLeft) {
      this.car.setVelocityX(-200);
      this.car.setAngle(-5);
    } else if (moveRight) {
      this.car.setVelocityX(200);
      this.car.setAngle(5);
    } else {
      this.car.setAngle(0);
    }

    // --- Rough Terrain Shake ---
    if (this.car.x < ROAD.left || this.car.x > ROAD.right) {
      this.car.x += Phaser.Math.Between(-2, 2);
      this.car.y += Phaser.Math.Between(-2, 2);
    }

    // --- 3. Trailer Physics ---
    const targetX = this.car.x;
    const targetY = this.car.y + 120;
    this.trailer.x = Phaser.Math.Linear(this.trailer.x, targetX, 0.08);
    this.trailer.y = Phaser.Math.Linear(this.trailer.y, targetY, 0.08);

    if (this.trailer.x < ROAD.left || this.trailer.x > ROAD.right) {
      this.trailer.x += Phaser.Math.Between(-2, 2);
      this.trailer.y += Phaser.Math.Between(-2, 2);
    }

    const sway = (this.car.x - this.trailer.x) * 0.30;
    this.trailer.setAngle(sway * 3);

    // --- 4. UFO Logic ---
    this.ufo.update(this.score, this.car, this.gameOver);

    // --- 5. Spawning, moving and scoring obstacles ---
    this.spawner.update(currentSpeed, multiplier);
  }

  hitObstacle(playerOrTrailer, obstacle) {
    // Car and trailer can overlap in the same physics step: handle the crash once
    if (this.gameOver) return;

    this.physics.pause();
    this.gameOver = true;
    this.gameOverAt = this.time.now;
    playerOrTrailer.setTint(0xff0000);

    // Stop engine sound, play crash sound
    this.audio.silenceForGameOver();
    this.audio.playCrash();

    // Check High Score
    this.checkHighScore();
  }

  checkHighScore() {
    if (this.highScoreManager.qualifies(this.score)) {
      // Show Input Form
      this.form.show();

      this.scoreText.setText('NEW HIGH SCORE: ' + this.score);
    } else {
      // Just show game over and list
      this.showGameOverScreen();
    }
  }

  showGameOverScreen() {
    this.highScoreText.setText(this.highScoreManager.renderLeaderboard());
    this.highScoreText.setVisible(true);

    this.scoreText.setText('CRASH! Final Score: ' + this.score);
  }

  restartGame() {
    this.gameOver = false;
    this.score = 0;
    this.speed = TUNING.baseSpeed;
    this.stepAccumulator = 0;

    // Restart engine sound
    this.audio.resetEngine();

    this.multiplierText.setVisible(false);
    this.multiplierText.setText('');
    this.highScoreText.setVisible(false);

    this.car.clearTint();
    this.trailer.clearTint();

    this.car.setPosition(240, 400);
    this.trailer.setPosition(240, 500);

    this.spawner.clear();
    this.spawner.start(); // same grace period as the first run

    this.ufo.reset();

    this.physics.resume();

    this.scoreText.setText('Score: 0');
    this.scoreText.setStyle({ fill: '#ffffff' });
  }
}
