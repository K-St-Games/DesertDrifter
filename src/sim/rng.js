// WP-B3: gameplay RNG, separate from cosmetic/audio randomness.
//
// One seeded generator instance drives all gameplay draws (spawning, obstacle
// behaviors, terrain offsets, UFO targets) in a fixed draw order. Cosmetic HUD shake and the music
// start offset stay on Math.random (via Phaser.Math), so audio load timing can
// never shift the gameplay sequence.
//
// Generator: the mulberry-style hash previously inlined in main.js, now as an
// instance with int(min, max) (inclusive) and float() ([0, 1)).
// Seeded from the ?seed= text, or from Math.random() when the flag is absent
// (unseeded runs still vary).
//
// SEED COMPATIBILITY: before B3, ?seed= replaced the global Math.random, so
// gameplay, HUD shake and the music offset shared one stream. From B3 on, the
// same seed text seeds only the gameplay stream (and in a different draw
// order), so old seeds will NOT reproduce old runs.

export function hashSeedString(seed) {
  let a = 0;
  for (const c of seed) a = (a * 31 + c.charCodeAt(0)) >>> 0;
  return a >>> 0;
}

export class GameplayRng {
  constructor(seedText = null) {
    this.reset(seedText);
  }

  // Restart the stream. Called with the run's seed text on restartGame() so
  // the same seed + inputs produce the same sequence (replayability).
  reset(seedText = this.seedText) {
    this.seedText = seedText ?? null;
    this.state = seedText == null
      ? (Math.random() * 4294967296) >>> 0
      : hashSeedString(seedText);
    return this;
  }

  // Uniform float in [0, 1).
  float() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Uniform integer in [min, max], inclusive (same contract as Between).
  int(min, max) {
    return Math.floor(this.float() * (max - min + 1)) + min;
  }
}

export function createGameplayRng(seedText = null) {
  return new GameplayRng(seedText);
}

// Reads ?seed= from a query string (defaults to window.location.search).
// Returns the raw text, or null when the flag is absent / unreadable.
// Takes an explicit string so tests do not need a DOM.
export function readSeedParam(search) {
  try {
    const query = search ?? (typeof window !== 'undefined' ? window.location.search : '');
    return new URLSearchParams(query).get('seed');
  } catch {
    return null;
  }
}
