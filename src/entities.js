import { BEHAVIORS } from './behaviors.js';

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

// Boot-time table check (WP-C2): throws the first problem found with a
// field-specific message, e.g. `ENTITIES[rock].spawnZone "moon" is invalid`.
// Call with no arguments to check the shipped table; pass a custom table
// (and behavior registry) to check candidate rows in tests or tooling.
const KNOWN_CATEGORIES = new Set(['player', 'obstacle', 'boss']);
const KNOWN_SPAWN_ZONES = new Set(['road', 'desert', 'any']);
const KNOWN_SHAPES = new Set(['box', 'circle']);

function isSizeRatio(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1;
}

function isCenterRatio(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function checkCollision(id, collision) {
  const where = `ENTITIES[${id}].collision`;
  if (collision === null || typeof collision !== 'object') {
    throw new Error(`${where} is missing (expected a { shape, ...ratios } object)`);
  }
  if (!KNOWN_SHAPES.has(collision.shape)) {
    throw new Error(`${where}.shape ${JSON.stringify(collision.shape)} is invalid (expected "box" or "circle")`);
  }
  for (const field of ['centerXRatio', 'centerYRatio']) {
    if (!isCenterRatio(collision[field])) {
      throw new Error(`${where}.${field} ${String(collision[field])} is out of range (expected a number in [0, 1])`);
    }
  }
  if (collision.shape === 'box') {
    for (const field of ['widthRatio', 'heightRatio']) {
      if (!isSizeRatio(collision[field])) {
        throw new Error(`${where}.${field} ${String(collision[field])} is out of range (expected a number in (0, 1])`);
      }
    }
  } else {
    if (!isSizeRatio(collision.radiusRatio)) {
      throw new Error(`${where}.radiusRatio ${String(collision.radiusRatio)} is out of range (expected a number in (0, 1])`);
    }
  }
}

export function validateEntities(table = ENTITIES, behaviors = BEHAVIORS) {
  if (table === null || typeof table !== 'object') {
    throw new Error('ENTITIES table is missing (expected an object keyed by entity id)');
  }
  for (const [id, def] of Object.entries(table)) {
    if (def === null || typeof def !== 'object') {
      throw new Error(`ENTITIES[${id}] is missing (expected a definition object)`);
    }
    if (!KNOWN_CATEGORIES.has(def.category)) {
      throw new Error(`ENTITIES[${id}].category ${JSON.stringify(def.category)} is unknown (expected one of: player, obstacle, boss)`);
    }
    const expectedFile = `assets/sprites/${id}.png`;
    if (def.file !== expectedFile) {
      throw new Error(`ENTITIES[${id}].file ${JSON.stringify(def.file)} does not match the baked sprite path (expected ${JSON.stringify(expectedFile)})`);
    }
    if ('points' in def) {
      if (typeof def.points !== 'number' || !Number.isFinite(def.points) || def.points < 0) {
        throw new Error(`ENTITIES[${id}].points ${String(def.points)} is invalid (expected a non-negative number)`);
      }
    }
    const spawnWeight = 'spawnWeight' in def ? def.spawnWeight : 0;
    if (typeof spawnWeight !== 'number' || !Number.isFinite(spawnWeight) || spawnWeight < 0) {
      throw new Error(`ENTITIES[${id}].spawnWeight ${String(def.spawnWeight)} is invalid (expected a non-negative number)`);
    }
    if (spawnWeight > 0) {
      if (!KNOWN_SPAWN_ZONES.has(def.spawnZone)) {
        throw new Error(`ENTITIES[${id}].spawnZone ${JSON.stringify(def.spawnZone)} is invalid (expected one of: road, desert, any)`);
      }
    } else if ('spawnZone' in def && !KNOWN_SPAWN_ZONES.has(def.spawnZone)) {
      throw new Error(`ENTITIES[${id}].spawnZone ${JSON.stringify(def.spawnZone)} is invalid (expected one of: road, desert, any)`);
    }
    if (def.behavior !== undefined && def.behavior !== null) {
      const behaviorId = def.behavior.id;
      if (typeof behaviorId !== 'string' || !Object.prototype.hasOwnProperty.call(behaviors, behaviorId)) {
        throw new Error(`ENTITIES[${id}].behavior.id ${JSON.stringify(behaviorId)} is unknown (expected one of: ${Object.keys(behaviors).join(', ') || 'none'})`);
      }
    }
    checkCollision(id, def.collision);
  }
  return true;
}
