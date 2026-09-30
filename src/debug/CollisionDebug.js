// Press 0 to draw the physics bodies. Circles use body.halfWidth, the scaled radius that collisions really use
// (body.radius is the unscaled source radius and is wrong whenever a sprite is scaled).
export class CollisionDebug {
  constructor(scene) {
    this.scene = scene;
    this.on = false;
    this.graphics = scene.add.graphics().setDepth(1000);
    this.key = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ZERO);
  }

  update(sprites) {
    if (Phaser.Input.Keyboard.JustDown(this.key)) this.on = !this.on;
    this.graphics.clear();
    if (!this.on) return;
    sprites.forEach(([sprite, color]) => sprite && sprite.active && sprite.visible && this.draw(sprite.body, color));
  }

  draw(body, color) {
    const g = this.graphics;
    g.fillStyle(color, 0.3).lineStyle(2, color, 0.95);
    if (body.isCircle) {
      g.fillCircle(body.center.x, body.center.y, body.halfWidth).strokeCircle(body.center.x, body.center.y, body.halfWidth);
    } else {
      g.fillRect(body.x, body.y, body.width, body.height).strokeRect(body.x, body.y, body.width, body.height);
    }
  }
}
