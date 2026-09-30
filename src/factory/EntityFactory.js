import { ENTITIES } from '../entities.js';

// Creates sprites and applies the hitbox defined in the entity table.
export class EntityFactory {
  constructor(scene) {
    this.scene = scene;
  }

  createSprite(id, x, y) {
    const sprite = this.scene.physics.add.sprite(x, y, id);
    this.applyCollision(sprite, id);
    return sprite;
  }

  createInGroup(group, id, x, y) {
    const sprite = group.create(x, y, id);
    this.applyCollision(sprite, id);
    return sprite;
  }

  applyCollision(sprite, id) {
    const c = ENTITIES[id].collision;
    const body = sprite.body;
    if (c.shape === 'circle') {
      const radius = sprite.width * c.radiusRatio;
      body.setCircle(radius);
      body.setOffset(sprite.width * c.centerXRatio - radius, sprite.height * c.centerYRatio - radius);
    } else {
      const w = sprite.width * c.widthRatio;
      const h = sprite.height * c.heightRatio;
      body.setSize(w, h);
      body.setOffset(sprite.width * c.centerXRatio - w / 2, sprite.height * c.centerYRatio - h / 2);
    }
  }
}
