// Movement set up on an obstacle when it spawns, by behavior id. Random draw order is part of the game feel; keep it.
// Draws come from the shared gameplay RNG (src/sim/rng.js), in the same order as before.
export const BEHAVIORS = {
  // Rolls sideways while spinning
  tumble(obstacle, p, rng) {
    const direction = rng.int(0, 1) === 0 ? -1 : 1;
    const moveSpeed = rng.int(p.speedMin, p.speedMax);
    obstacle.setVelocityX(moveSpeed * direction);
    obstacle.setAngularVelocity(rng.int(p.spinMin, p.spinMax) * direction);
  },
  // Crawls slowly sideways
  crawl(obstacle, p, rng) {
    const direction = rng.int(0, 1) === 0 ? -1 : 1;
    obstacle.setVelocityX(p.speed * direction);
  },
};

export function applyBehavior(obstacle, behavior, rng) {
  if (!behavior) {
    obstacle.setVelocityX(0); // static
    return;
  }
  BEHAVIORS[behavior.id](obstacle, behavior, rng);
}
