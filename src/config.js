// Game-wide configuration. Values are unchanged from the original single-file game.js.

export const GAME = { width: 480, height: 640 };

// Lane geometry (x, in game pixels). The car is "off-road" (rough-terrain shake) outside left..right.
// Rocks and turtles spawn on the road, trees in the desert on either side, tumbleweeds anywhere.
// tilePositionX positions the road texture horizontally.
export const ROAD = {
  left: 160,
  right: 320,
  // Centres the asphalt (texture columns 409-614) on x=240; was 260, which sat 11.5 px right of the lane logic.
  tilePositionX: 272,
  treeZones: [[20, 130], [350, 460]],
  anywhere: [50, 430],
};

// Simulation runs at a fixed 60 Hz step regardless of display refresh rate.
export const TUNING = {
  stepMs: 1000 / 60,
  maxFrameMs: 100, // clamp long frames (tab switches) so the sim never spirals
  baseSpeed: 1,
  speedIncrement: 0.0001, // per step; base speed creeps up during a run
  maxBaseSpeed: 1.8, // stays below the x2 multiplier threshold (2)
  restartLockoutMs: 500,
  firstSpawnDelayMs: 2000,
};

// UFO boss tunables (timers are counted in fixed steps, 60 per second)
export const UFO = {
  scoreThreshold: 2000,
  hovers: 3, // random hover points before locking on
  attacks: 3,
  chargeSteps: 180, // warning beam
  fireSteps: 60, // deadly beam
  beamHalfWidth: 40,
  respawnMs: [10000, 20000],
};

export function createGameConfig(scenes) {
  return {
    type: Phaser.AUTO,
    width: GAME.width,
    height: GAME.height,
    parent: 'game-container',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: 0 },
        debug: false,
      },
    },
    scene: scenes,
    pixelArt: true,
  };
}
