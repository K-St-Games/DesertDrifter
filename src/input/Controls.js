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
}
