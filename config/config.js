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
  // Weighted toward the smaller blocks because most 3-tile shapes span all
  // 3 cells of a 3x3 board, leaving them only one legal anchor. A 3-heavy
  // mix dead-ends constantly there (simulated: 56/60 runs ended with an
  // unplaceable last block, vs 34/60 at these weights).
  blockSizeWeights: {
    1: 0.3,
    2: 0.45,
    3: 0.25,
  },

  // TUNABLE. Starting value for every tile. A number, or 'random' to give
  // each tile its own value strictly between 0 and maxValue.
  startValue: 0,

  // TUNABLE. Tile cap. A tile pushed above this costs one strike and is
  // reset to exactly this value. Also the ceiling for 'random' start values.
  maxValue: 9,

  // TUNABLE. Strikes the player can take before losing.
  maxStrikes: 5,

  // TUNABLE. How much each column's score bar holds. All bars full = win.
  barCapacity: 100,

  // TUNABLE. Relative weights for each cell's operator draw. Also
  // normalized, so the settings panel can show percentages without forcing
  // the playtester to balance them by hand.
  operatorWeights: {
    none: 0.55,
    plus1: 0.18,
    minus1: 0.18,
    x2: 0.045,
    div2: 0.045,
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
};

export function getConfig(variantName) {
  return variantConfigs[variantName] || variantConfigs.lineLevel;
}

export const VARIANT_NAMES = ['lineLevel', 'orderBoard'];

export const VARIANT_LABELS = {
  lineLevel: 'Line Level',
  orderBoard: 'Order Board',
};
