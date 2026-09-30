// Game-wide configuration. Values are unchanged from the original single-file game.js.

export const GAME = { width: 480, height: 640 };

// Lane geometry (x, in game pixels). The car is "off-road" (rough-terrain shake) outside left..right.
// Rocks and turtles spawn on the road, trees in the desert on either side, tumbleweeds anywhere.
// tilePositionX positions the road texture horizontally.
export const ROAD = {
  left: 160,
  right: 320,
  tilePositionX: 260,
  treeZones: [[20, 130], [350, 460]],
  anywhere: [50, 430],
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
