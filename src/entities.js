// Single source of truth for every sprite: file, scoring, spawning and hitbox.
// Sprites are baked at their on-screen size (scale 1), so hitbox ratios are fractions of the frame.
// collision: box {widthRatio, heightRatio} or circle {radiusRatio}, centred at (centerXRatio, centerYRatio).
// spawnWeight: 0 or absent means the entity never spawns randomly. spawnZone: 'road' | 'desert' | 'any'.
// behavior: id in behaviors.js plus its parameters.

const CENTER = { centerXRatio: 0.5, centerYRatio: 0.5 };

export const ENTITIES = {
  car: {
    category: 'player',
    file: 'assets/sprites/car.png',
    collision: { shape: 'box', widthRatio: 0.5, heightRatio: 0.6, ...CENTER },
  },
  trailer: {
    category: 'player',
    file: 'assets/sprites/trailer.png',
    collision: { shape: 'box', widthRatio: 0.5, heightRatio: 0.5, ...CENTER },
  },
  ufo: {
    category: 'boss',
    file: 'assets/sprites/ufo.png',
    collision: { shape: 'circle', radiusRatio: 0.35, ...CENTER },
  },
  tumbleweed: {
    category: 'obstacle',
    file: 'assets/sprites/tumbleweed.png',
    points: 50,
    spawnWeight: 35,
    spawnZone: 'any',
    collision: { shape: 'circle', radiusRatio: 0.3, ...CENTER },
    behavior: { id: 'tumble', speedMin: 30, speedMax: 80, spinMin: 100, spinMax: 300 },
  },
  rock: {
    category: 'obstacle',
    file: 'assets/sprites/rock.png',
    points: 100,
    spawnWeight: 30,
    spawnZone: 'road',
    collision: { shape: 'box', widthRatio: 0.7, heightRatio: 0.6, ...CENTER },
  },
  tree: {
    category: 'obstacle',
    file: 'assets/sprites/tree.png',
    points: 100,
    spawnWeight: 25,
    spawnZone: 'desert',
    // Trunk only: the box covers 60-90% of the frame height
    collision: { shape: 'box', widthRatio: 0.3, heightRatio: 0.3, centerXRatio: 0.5, centerYRatio: 0.75 },
  },
  turtle: {
    category: 'obstacle',
    file: 'assets/sprites/turtle.png',
    points: 200,
    spawnWeight: 10,
    spawnZone: 'road',
    collision: { shape: 'circle', radiusRatio: 0.25, ...CENTER },
    behavior: { id: 'crawl', speed: 10 },
  },
  // Ready to go but not spawning: raise spawnWeight to enable (new content is deferred).
  armadillo: {
    category: 'obstacle',
    file: 'assets/sprites/armadillo.png',
    points: 50,
    spawnWeight: 0,
    spawnZone: 'road',
    collision: { shape: 'circle', radiusRatio: 0.25, ...CENTER },
  },
};

export function spawnableIds() {
  return Object.keys(ENTITIES).filter((id) => ENTITIES[id].category === 'obstacle' && (ENTITIES[id].spawnWeight || 0) > 0);
}
