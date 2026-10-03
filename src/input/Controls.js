// Keyboard (arrows + WASD) and touch/pointer input behind one API. Behavior unchanged from the original game.js.
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

  // Speed change on top of the base speed: boost (+4) and brake (-0.5), from keys and touch.
  speedDelta() {
    const pointer = this.pointer;
    let delta = 0;

    if (this.cursors.up.isDown || this.keyW.isDown) delta += 4;
    if (this.cursors.down.isDown || this.keyS.isDown) delta -= 0.5;

    // Touch Speed Controls
    if (pointer.isDown) {
      if (pointer.y < 320) {
        delta += 4; // Top half = Boost
      } else if (pointer.y > 500) {
        delta -= 0.5; // Bottom area = Brake
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
      if (pointer.x < 240) left = true;
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
  // hand-written object to step(). Touch zones are unchanged (y<320 boost,
  // y>500 brake, x<240 left else right). Left takes priority when both
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
