// Movement set up on an obstacle when it spawns, by behavior id. Random draw order is part of the game feel; keep it.
export const BEHAVIORS = {
  // Rolls sideways while spinning
  tumble(obstacle, p) {
    const direction = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
    const moveSpeed = Phaser.Math.Between(p.speedMin, p.speedMax);
    obstacle.setVelocityX(moveSpeed * direction);
    obstacle.setAngularVelocity(Phaser.Math.Between(p.spinMin, p.spinMax) * direction);
  },
  // Crawls slowly sideways
  crawl(obstacle, p) {
    const direction = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
    obstacle.setVelocityX(p.speed * direction);
  },
};

export function applyBehavior(obstacle, behavior) {
  if (!behavior) {
    obstacle.setVelocityX(0); // static
    return;
  }
  BEHAVIORS[behavior.id](obstacle, behavior);
}
