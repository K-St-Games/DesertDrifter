import assert from 'node:assert/strict';
import test from 'node:test';
globalThis.Phaser = {
  Scene: class {},
  Math: { Between: () => 0, Linear: (a, b, t) => a + (b - a) * t },
};
const { GameScene } = await import('../src/scenes/GameScene.js');
const { TUNING } = await import('../src/config.js');

test('each physics tick publishes body displacement before the next tick', () => {
  let pendingX = null;
  let synchronizations = 0;
  const car = {
    x: 240, y: 400, vx: 0,
    setVelocity() { this.vx = 0; }, setVelocityX(v) { this.vx = v; }, setAngle() {},
  };
  const scene = Object.assign(new GameScene(), {
    tick: 0, speed: 1, score: 0, gameOver: false, rng: { int: () => 0 },
    car, trailer: { x: 240, y: 500, setAngle() {} },
    road: { tilePositionY: 0 },
    controls: { speedDelta: () => 0, steer: () => ({ left: false, right: true }) },
    audio: { updateEngineSpeed() {}, updateUfo() {} },
    scoreText: { setText() {} }, multiplierText: { setVisible() {} },
    ufo: { active: false, update() {} }, spawner: { update() {} },
    physics: { world: {
      update(time, ms) { pendingX = car.x + car.vx * ms / 1000; },
      postUpdate() { car.x = pendingX; pendingX = null; synchronizations++; },
    } },
  });
  for (let i = 0; i < 12; i++) scene.step({ steer: 1, speedDelta: 0 });
  assert.equal(synchronizations, 12);
  assert.ok(Math.abs(car.x - (240 + 200 * 12 * TUNING.stepMs / 1000)) < 0.01);
});
