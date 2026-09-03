// Bumped on every push. Shown in the footer so a playtester can confirm at
// a glance which build they actually have - the module graph is cached per
// file, so a stale browser can otherwise mix versions invisibly.
export const APP_VERSION = 'build 9';

// All the "starting values, not constants" from the design brief live here.
// Each variant config extends the shared base below.
//
// Everything marked TUNABLE is editable live by the playtester from the
// in-page Settings panel; those values are read from localStorage at
// startup and merged over these defaults (see ui/settings.js), so editing
// here changes what a fresh playtester gets, not what an existing one has.

export const baseConfig = {
  // TUNABLE. Grid is boardSize x boardSize, with one score bar per column.
  boardSize: 3,

  handSize: 3,

  // TUNABLE. Relative spawn weights per block tile-count. Normalized by the
  // RNG, so these don't need to sum to anything.
  //
  // 3-tile blocks dominate. That used to dead-end constantly on a 3x3,
  // since most 3-tile shapes span the full width and so have a single legal
  // anchor - but ÷2 now accepts any value, so no placement can be rejected
  // for numeric reasons and the dead end is gone.
  blockSizeWeights: {
    1: 0.1,
    2: 0.25,
    3: 0.65,
  },

  // TUNABLE. Starting value for every tile. A number, or 'random' to give
  // each tile its own value strictly between 0 and maxValue.
  startValue: 0,

  // TUNABLE. Tile cap. A tile pushed above this costs one strike and is
  // reset to exactly this value. Also the ceiling for 'random' start values
  // and for the random row/column quotas, so a quota is always reachable.
  maxValue: 9,

  // TUNABLE. Strikes the player can take before losing.
  maxStrikes: 5,

  // TUNABLE. Relative weights for each cell's operator draw. Also
  // normalized, so the settings panel can show percentages without forcing
  // the playtester to balance them by hand.
  operatorWeights: {
    none: 0.5,
    plus1: 0.31,
    minus1: 0.11,
    x2: 0.045,
    div2: 0.035,
  },
};

export const variantConfigs = {
  lineLevel: {
    ...baseConfig,
  },
  orderBoard: {
    ...baseConfig,
    startTarget: 3,
    incrementEvery: 5,
  },
  fight: {
    ...baseConfig,

    // Tiles may go negative here - a negative tile is a red one, drawn as
    // its magnitude without a minus sign. Turns off the clamp-at-0 rule and
    // the strike cap; Fight has its own win/lose.
    signedValues: true,

    // TUNABLE. How many tiles get threatened at the start of each turn, and
    // the most red triangles any one of them can carry.
    threatsPerTurn: 3,
    threatMaxStacks: 2,

    // TUNABLE. Share of the board one side must hold to end the run. On a
    // 3x3 that's 9 * 0.7 = 6.3, so 7 tiles.
    controlThreshold: 0.7,
  },
};

export function getConfig(variantName) {
  return variantConfigs[variantName] || variantConfigs.lineLevel;
}

export const VARIANT_NAMES = ['lineLevel', 'orderBoard', 'fight'];

export const VARIANT_LABELS = {
  lineLevel: 'Line Level',
  orderBoard: 'Order Board',
  fight: 'Fight Mode',
};
