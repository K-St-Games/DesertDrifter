// Keyboard (arrows + WASD) and touch/pointer input behind one API. Behavior unchanged from the original game.js.
import { CONTROLS } from '../config.js';

export class Controls {
  constructor(scene) {
    this.scene = scene;
    this.cursors = scene.input.keyboard.createCursorKeys();
    // WASD keys
    this.keyA = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyW = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyS = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyM = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.keyP = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
  }

  pauseJustPressed() {
    return Phaser.Input.Keyboard.JustDown(this.keyP);
  }

  muteJustPressed() {
    return Phaser.Input.Keyboard.JustDown(this.keyM);
  }

  get pointer() {
    return this.scene.input.activePointer;
  }

  // Speed change on top of the base speed: boost (+) and brake (-), from keys and touch.
  speedDelta() {
    const pointer = this.pointer;
    let delta = 0;

    if (this.cursors.up.isDown || this.keyW.isDown) delta += CONTROLS.boost;
    if (this.cursors.down.isDown || this.keyS.isDown) delta -= CONTROLS.brake;

    // Touch Speed Controls
    if (pointer.isDown) {
      if (pointer.y < CONTROLS.boostZoneY) {
        delta += CONTROLS.boost; // Top half = Boost
      } else if (pointer.y > CONTROLS.brakeZoneY) {
        delta -= CONTROLS.brake; // Bottom area = Brake
      }
    }

    return delta;
  }

  // Steering from keys and touch (left half / right half of the screen)
  steer() {
    const pointer = this.pointer;
    let left = this.cursors.left.isDown || this.keyA.isDown;
    let right = this.cursors.right.isDown || this.keyD.isDown;

    // Touch Steering
    if (pointer.isDown) {
      if (pointer.x < CONTROLS.steerSplitX) left = true;
      else right = true;
    }

    return { left, right };
  }

  restartRequested() {
    return this.cursors.space.isDown || this.pointer.isDown;
  }

  // WP-B4: one input snapshot per rendered frame. GameScene.update() takes it
  // once and hands the same object to every step() that frame, so all steps
  // in a frame see identical input (held keys for steer/speedDelta, JustDown
  // edge for pause/mute, held press for restart) and a test can feed a
  // hand-written object to step(). Touch zones are unchanged (see CONTROLS:
  // boostZoneY/brakeZoneY/steerSplitX). Left takes priority when both
  // directions are held, matching steer().
  sample() {
    const { left, right } = this.steer();
    return {
      steer: left ? -1 : right ? 1 : 0,
      speedDelta: this.speedDelta(),
      restart: this.restartRequested(),
      pause: this.pauseJustPressed(),
      mute: this.muteJustPressed(),
    };
  }
}
