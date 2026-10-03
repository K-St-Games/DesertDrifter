import { ROAD, TUNING } from '../config.js';
import { CollisionDebug } from '../debug/CollisionDebug.js';
import { EntityFactory } from '../factory/EntityFactory.js';
import { AudioManager } from '../audio/AudioManager.js';
import { Controls } from '../input/Controls.js';
import { HighScoreManager } from '../managers/HighScoreManager.js';
import { SpawnSystem } from '../systems/SpawnSystem.js';
import { UfoSystem } from '../systems/UfoSystem.js';
import { createGameplayRng, readSeedParam } from '../sim/rng.js';
import { HighScoreForm } from '../ui/HighScoreForm.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    this.speed = TUNING.baseSpeed;
    this.score = 0;
    this.gameOver = false;
    this.gameOverAt = 0; // tick of the crash (see this.tick); lockout is tick-based
    this.paused = false;
    this.tick = 0; // WP-B1: single gameplay clock, +1 per step(); frozen while paused
    this.stepAccumulator = 0;

    // WP-A4: render interpolation state (display only, never collision).
    // renderPrev/renderCurr are sim-position snapshots around the last step;
    // update() blends game-object render state between them by renderAlpha,
    // which is always in [0, 1]. Bodies are never touched, so collisions and
    // the hitbox overlay always see exact sim positions.
    this.renderPrev = null;
    this.renderCurr = null;
    this.renderAlpha = null;

    // WP-B3: one gameplay RNG per run, shared by spawning, behaviors and UFO
    // targets in deterministic draw order. Seeded from ?seed= (stashed on
    // window by main.js) or from Math.random() when absent. Cosmetic shake
    // and the music offset below stay on Phaser.Math (Math.random) and never
    // consume this stream.
    this.seedText = (typeof window !== 'undefined' && window.__DESERT_DRIFTER_SEED__ !== undefined)
      ? window.__DESERT_DRIFTER_SEED__
      : readSeedParam();
    this.rng = createGameplayRng(this.seedText);

    this.factory = new EntityFactory(this);

    // Load High Scores
    this.highScoreManager = new HighScoreManager();

    // 1. Audio
    // Create procedural engine sound (Web Audio API)
    this.audio = new AudioManager();
    this.audio.init();
    this.sound.mute = this.audio.muted;
    if (this.audio.muted) this.audio.applyMute();

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
      factory: this.factory,
      isGameOver: () => this.gameOver,
      rng: this.rng,
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
    this.trailer = this.factory.createSprite('trailer', 240, 500);

    // 4. Car
    this.car = this.factory.createSprite('car', 240, 400);
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

    this.spawner.start(this.tick);

    // 8. Collisions
    this.physics.add.overlap(this.car, this.spawner.group, this.hitObstacle, null, this);
    this.physics.add.overlap(this.trailer, this.spawner.group, this.hitObstacle, null, this);
    // WP-B2: physics advances on the gameplay clock, not the render loop.
    // Phaser 3.90 Arcade (ArcadePhysics.start) subscribes World.update to every
    // Scene UPDATE unless disabled, and World.update then steps on render
    // timing (fixedStep/fps accumulator), so the car integrated on the display
    // refresh rate instead of the 60 Hz gameplay step. disableUpdate() detaches
    // that link (ArcadePhysics API for self-driven updates, since 3.50.0);
    // step() below drives the world exactly once per tick.
    this.physics.world.disableUpdate();

    // 9. UFO
    this.ufo = new UfoSystem(this, {
      factory: this.factory,
      rng: this.rng,
      onBeamHit: (car, ufoSprite) => this.hitObstacle(car, ufoSprite),
    });

    this.pausedText = this.add.text(240, 300, 'PAUSED\nPress P', { fontSize: '28px', fill: '#ffffff', stroke: '#000000', strokeThickness: 5, align: 'center' }).setOrigin(0.5).setDepth(50).setVisible(false);
    this.hint = this.add.text(240, 610, 'Arrows/WASD or touch to steer  |  Up = boost  |  M mute  |  P pause', { fontSize: '12px', fill: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: this.hint, alpha: 0, delay: 6000, duration: 1500 });

    this.debug = new CollisionDebug(this);
    window.render_game_to_text = () => this.renderGameToText();
    // WP-B5: manual step driver for replay/determinism checks. Debug-only like
    // window.game in main.js: never exposed on player builds.
    try {
      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')) {
        window.advanceTime = (ms, input) => this.advanceTime(ms, input);
      }
    } catch {
      // Non-browser (node tests): scene.advanceTime() is still callable directly.
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      delete window.render_game_to_text;
      delete window.advanceTime;
    });

    // High score entry form (DOM)
    this.form = new HighScoreForm({
      onSubmit: (rawInitials) => {
        if (this.highScoreManager.submit(rawInitials, this.score)) {
          this.hideForm();
          this.showGameOverScreen();
        }
      },
      onSkip: () => {
        this.hideForm();
        this.showGameOverScreen();
      },
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.form.destroy());
  }

  update(time, delta) {
    // WP-A4: restore exact sim positions before anything reads them. The
    // previous frame ended with display-interpolated values in the game
    // objects; physics preUpdate, the overlay and every step() below must see
    // the simulation, never the display blend.
    this.restoreSimPositions();

    this.debug.update([[this.car, 0x00ff66], [this.trailer, 0x00ccff], [this.ufo.active ? this.ufo.sprite : null, 0xff00ff], ...this.spawner.group.getChildren().map((o) => [o, 0xff3355])]);

    // WP-B4: sample input once per rendered frame. Every step() below consumes
    // this same object, so a multi-step frame cannot see input change mid-frame.
    // Edge triggers (pause/mute/restart) are handled once here, never per step.
    const input = this.controls.sample();

    if (input.mute) {
      const muted = this.audio.toggleMute();
      this.sound.mute = muted;
    }

    if (!this.gameOver && input.pause) {
      this.paused = !this.paused;
      this.pausedText.setVisible(this.paused);
      // WP-B1: no timer fix-up needed. The gameplay clock (this.tick) only
      // advances inside step(), which stops running while paused, so spawn /
      // UFO cooldowns and the restart lockout simply do not elapse.
      if (this.paused) {
        this.physics.pause();
      } else {
        this.physics.resume();
      }
    }
    if (this.paused) return;

    if (this.gameOver) {
      // Only allow restart if NOT showing input form, and not straight after the crash
      if (!this.form.isVisible() && this.tick - this.gameOverAt > TUNING.restartLockoutSteps) {
        if (input.restart) {
          this.restartGame();
        }
      }
      return;
    }

    // Fixed-step simulation: identical speed on 60, 120 and 144 Hz displays.
    this.stepAccumulator += Math.min(delta, TUNING.maxFrameMs);
    let stepsThisFrame = 0;
    while (this.stepAccumulator >= TUNING.stepMs && !this.gameOver) {
      this.stepAccumulator -= TUNING.stepMs;
      // WP-A4: sim snapshot before the step. After the loop renderPrev is the
      // state before the LAST step, so the display blend renders between the
      // two most recent sim states at any refresh rate.
      this.renderPrev = this.snapshotRenderPositions();
      this.step(input);
      stepsThisFrame++;
    }
    if (stepsThisFrame > 0) this.renderCurr = this.snapshotRenderPositions();
    // WP-A4: display-only interpolation. The sim lives on in renderPrev/
    // renderCurr and the physics bodies; only game-object render state is
    // blended toward the next step, so 0/1/2-step frames render even motion.
    // alpha is the fraction of the way to the next step, always in [0, 1].
    this.applyRenderInterpolation(Math.min(Math.max(this.stepAccumulator / TUNING.stepMs, 0), 1));
  }

  // WP-B4: step() reads only the per-frame input object (hand-written in
  // tests, sampled live in update()). It never touches keyboard/pointer state.
  step(input) {
    // WP-B1: single gameplay clock. +1 per step; frozen while paused or
    // game-over because update() stops calling step(), so all tick-based
    // cooldowns (spawn, UFO, restart lockout) suspend automatically.
    this.tick++;

    // Base speed creeps up during a run
    this.speed = Math.min(this.speed + TUNING.speedIncrement, TUNING.maxBaseSpeed);

    // --- 1. Scroll Road ---
    let currentSpeed = this.speed;

    currentSpeed += input.speedDelta;

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
    const steer = input.steer; // -1|0|1, sampled once per frame (left wins ties)

    if (steer < 0) {
      this.car.setVelocityX(-200);
      this.car.setAngle(-5);
    } else if (steer > 0) {
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
    this.ufo.update(this.tick, this.score, this.car, this.gameOver);

    // --- 5. Spawning, moving and scoring obstacles ---
    this.spawner.update(this.tick, currentSpeed, multiplier);

    // --- 6. Physics: one fixed world step per gameplay step ---
    // WP-B2: World.update(0, stepMs) with the default fixedStep/fps=60 advances
    // exactly one step: _elapsed (0 + stepMs) crosses one frame, so preUpdate +
    // one integration + one collider pass run, and the while loop has nothing
    // left (~0 remaining). Overlap callbacks (hitObstacle, with its re-entry
    // guard) therefore fire at most once per tick, on final tick positions.
    // update() — not step(seconds) — is the entry point because several bodies
    // are moved by direct GameObject writes each step (trailer lerp, obstacle Y
    // scroll, terrain shake) and only update()'s preUpdate syncs those into the
    // bodies via Body.updateFromGameObject before colliding; a raw step() would
    // integrate and test stale body positions (obstacle bodies, which carry no
    // Y velocity, would never move in Y and overlaps would never fire).
    this.physics.world.update(0, TUNING.stepMs);
  }

  // --- WP-B5: manual advancement and richer snapshot ---
  //
  // advanceTime(ms, input) runs exactly round(ms / stepMs) gameplay steps, so
  // advanceTime(1000) is 60 steps. It calls step() directly with no rAF, no
  // accumulator and no wall-clock reads: real-time updates are suspended. The
  // Arcade world is already detached from the render loop (disableUpdate in
  // create()) and step() drives it once per tick, so nothing else advances and
  // the step accumulator is left untouched.
  //
  // `input` is the per-step input object consumed by step(): either one object
  // reused for every step (default: neutral — no steer, no boost/brake) or a
  // function (upcomingTick, stepIndex) => object for scripted runs. Like
  // update(), it never steps while paused or after a game-over crash, so it
  // stops early in those states. Returns the steps actually run.
  advanceTime(ms, input) {
    const steps = Math.round(ms / TUNING.stepMs);
    // Start from exact sim: undo any display blend the last rendered frame
    // left in the game objects (the same restore update() runs before steps).
    this.restoreSimPositions();
    const NEUTRAL = { steer: 0, speedDelta: 0, restart: false, pause: false, mute: false };
    let ran = 0;
    for (let i = 0; i < steps; i++) {
      if (this.paused || this.gameOver) break;
      const stepInput = typeof input === 'function' ? input(this.tick + 1, i) : (input || NEUTRAL);
      this.renderPrev = this.snapshotRenderPositions();
      this.step(stepInput);
      ran++;
    }
    if (ran > 0) this.renderCurr = this.snapshotRenderPositions();
    return ran;
  }

  // --- WP-A4: display-only render interpolation ---
  //
  // Proven cause of ISSUE-4 is (b): the fixed 60 Hz step runs 0, 1 or 2 times
  // per rendered frame, so at 120 Hz+ on-screen motion alternates 0/~2.2 px
  // (WP-A0: 1.09+-1.09 px/frame; node model in the PR description reproduces
  // it and shows integer rounding alone cannot fix it). Cause (a) is bounded
  // by construction: road and sprites advance by identical float increments,
  // so differential rounding is <= 1 px, never 0-vs-2.2 px frames. Cause (c)
  // was resolved by WP-B2 (world.update runs once per step, inside step()).
  //
  // The sim is never touched: step() still writes exact positions (which the
  // B4 tests assert), physics preUpdate syncs bodies from restored sim
  // positions, and only game-object render state is blended after the last
  // step of a frame, then restored before the next frame's steps.

  // Every display-interpolated mover: sim-driven objects whose game-object
  // position is render state. Bodies are NOT included: the hitbox overlay
  // draws sprite.body, so it always tracks collision truth. Missing parts are
  // skipped so stubbed scenes (tests) can drive the real update()/step().
  renderSprites() {
    const out = [];
    if (this.car) out.push(this.car);
    if (this.trailer) out.push(this.trailer);
    if (this.ufo && this.ufo.sprite) out.push(this.ufo.sprite);
    const group = this.spawner && this.spawner.group;
    if (group && typeof group.getChildren === 'function') {
      for (const child of group.getChildren()) if (child) out.push(child);
    }
    return out;
  }

  // Exact sim positions. Game objects hold sim values at every capture point
  // (post-step or post-restore), so this is a copy-out of the simulation.
  snapshotRenderPositions() {
    const snap = { roadY: this.road ? this.road.tilePositionY : 0, sprites: new Map() };
    for (const o of this.renderSprites()) snap.sprites.set(o, { x: o.x, y: o.y });
    return snap;
  }

  // Undo the display blend. Runs at the top of update() and nowhere else, so
  // steps and physics always run on exact sim positions. Entries for
  // destroyed obstacles are skipped (they left the group); objects spawned
  // after the snapshot are already at sim positions and need no restore.
  restoreSimPositions() {
    const curr = this.renderCurr;
    if (!curr) return;
    if (this.road) this.road.tilePositionY = curr.roadY;
    for (const [o, p] of curr.sprites) {
      if (o && o.active !== false) { o.x = p.x; o.y = p.y; }
    }
  }

  // Blend game-object render state between the last two sim states.
  // Display-only: bodies and sim accumulators are never written, so
  // collisions resolve on exact positions. Obstacles spawned after the prev
  // snapshot (missing from it) render at their exact sim position.
  applyRenderInterpolation(alpha) {
    this.renderAlpha = alpha;
    const prev = this.renderPrev;
    const curr = this.renderCurr;
    if (!prev || !curr) return;
    if (this.road) this.road.tilePositionY = prev.roadY + (curr.roadY - prev.roadY) * alpha;
    for (const [o, c] of curr.sprites) {
      if (!o || o.active === false) continue;
      const p = prev.sprites.get(o);
      const px = p ? p.x : c.x;
      const py = p ? p.y : c.y;
      o.x = px + (c.x - px) * alpha;
      o.y = py + (c.y - py) * alpha;
    }
  }

  // Compact state for automated tests and debugging (window.render_game_to_text).
  //
  // Units: positions in game px, timers and countdowns in ticks (1 tick = 1
  // step, stepMs ~= 16.67 ms at 60 Hz). Fields: mode/tick/paused/score/speed
  // are run state on the gameplay clock; seed is the ?seed= text (null when
  // unseeded); rngState is the gameplay RNG's uint32 state (one hash advance
  // per float()/int() draw — equal states at equal ticks replay identically);
  // nextSpawnTick/spawnInTicks are the absolute tick and the countdown
  // (nextSpawnTick - tick) of the next obstacle spawn; ufo.timerSteps,
  // ufo.attackCount, ufo.hoverCount and ufo.nextSpawnTick/ufo.spawnInTicks
  // are the UFO boss timers in steps plus its absolute/countdown respawn tick
  // (0/negative respawn means not yet scheduled).
  renderGameToText() {
    const r = (v) => Math.round(v * 10) / 10;
    // WP-A4: report simulation positions, not the display blend. After an
    // update() with interpolation the game objects hold blended render
    // values, while renderCurr holds the exact sim; fall back to the objects
    // when no frame has run (e.g. direct step() flows in tests).
    const sim = (o) => (this.renderCurr && this.renderCurr.sprites.get(o)) || o;
    const spawnNext = this.spawner.nextSpawnTick ?? 0;
    const ufoNext = this.ufo.nextSpawnTick ?? 0;
    return JSON.stringify({
      mode: this.gameOver ? 'game_over' : 'running',
      tick: this.tick,
      paused: this.paused,
      seed: this.seedText ?? null,
      rngState: this.rng ? this.rng.state : null,
      nextSpawnTick: spawnNext,
      spawnInTicks: spawnNext - this.tick,
      score: this.score,
      speed: r(this.speed),
      car: { x: r(sim(this.car).x), y: r(sim(this.car).y) },
      trailer: { x: r(sim(this.trailer).x), y: r(sim(this.trailer).y) },
      ufo: {
        active: this.ufo.active,
        state: this.ufo.state,
        x: r(sim(this.ufo.sprite).x),
        y: r(sim(this.ufo.sprite).y),
        timerSteps: this.ufo.timer ?? 0,
        attackCount: this.ufo.attackCount ?? 0,
        hoverCount: this.ufo.hoverCount ?? 0,
        nextSpawnTick: ufoNext,
        spawnInTicks: ufoNext - this.tick,
      },
      obstacles: this.spawner.group.getChildren().filter((o) => o.active).map((o) => ({ id: o.texture.key, x: r(sim(o).x), y: r(sim(o).y) })),
    });
  }

  hitObstacle(playerOrTrailer, obstacle) {
    // Car and trailer can overlap in the same physics step: handle the crash once
    if (this.gameOver) return;

    this.physics.pause();
    this.gameOver = true;
    this.gameOverAt = this.tick;
    this.cameras.main.shake(200, 0.01);
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
      this.showForm();

      this.scoreText.setText('NEW HIGH SCORE: ' + this.score);
    } else {
      // Just show game over and list
      this.showGameOverScreen();
    }
  }

  // Phaser captures W/A/S/D, arrows and Space (preventDefault), which would swallow those letters in the initials field.
  showForm() {
    this.input.keyboard.disableGlobalCapture();
    this.form.show();
  }

  hideForm() {
    this.form.hide();
    this.input.keyboard.enableGlobalCapture();
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
    this.tick = 0; // new run restarts the gameplay clock (spawner/UFO derive from it)
    this.rng.reset(this.seedText); // WP-B3: same seed + inputs => same sequence
    this.stepAccumulator = 0;
    this.renderPrev = null; // WP-A4: old-run snapshots must not leak into the new run
    this.renderCurr = null;
    this.renderAlpha = null;

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
    this.spawner.start(this.tick); // same grace period as the first run

    this.ufo.reset();

    this.physics.resume();

    this.scoreText.setText('Score: 0');
    this.scoreText.setStyle({ fill: '#ffffff' });
  }
}
