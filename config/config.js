// All the "starting values, not constants" from the design brief live here.
// Each variant config extends the shared base below.
//
// Anything a playtester can change live from the in-page Settings panel is
// marked TUNABLE - those are read from localStorage at startup and merged
// over these defaults (see ui/settings.js), so editing here changes the
// default a fresh playtester gets, not what an existing one already has.

export const baseConfig = {
  boardSize: 4,
  handSize: 3,

  // TUNABLE. Starting value for every tile. A number, or 'random' to give
  // each tile its own value strictly between 0 and maxValue.
  startValue: 0,

  // TUNABLE. Upper bound of the number range. Pressure Cooker uses it as
  // the cap above which a tile dies; 'random' start values draw below it.
  maxValue: 12,

  // TUNABLE. How the bottom of the range behaves. One of:
  //   'strict'     - below 0 is impossible; dead hands are re-rolled
  //   'instaLoss'  - below 0 is allowed and ends the run immediately
  //   'clamp'      - below 0 is allowed, the tile floors at 0
  //   'deadAtZero' - as clamp, plus reaching 0 kills the tile
  underflowRule: 'strict',

  // TUNABLE. Relative weights for each cell's operator draw. These do not
  // need to sum to 1 - the RNG normalizes them - so the settings panel can
  // present them as percentages without forcing the playtester to balance.
  operatorWeights: {
    none: 0.55,
    plus1: 0.18,
    minus1: 0.18,
    x2: 0.045,
    div2: 0.045,
  },
};

export const variantConfigs = {
  sandbox: {
    ...baseConfig,
  },
  bloom: {
    ...baseConfig,
    minGroupSize: 3,
    baseScorePerTier: (value, groupSize) => value * value * groupSize,
  },
  orderBoard: {
    ...baseConfig,
    startTarget: 3,
    incrementEvery: 5,
    bankScorePerTarget: 10,
  },
  lineLevel: {
    ...baseConfig,
    lineScoreMultiplier: 1,
  },
  pressure: {
    ...baseConfig,
  },
  blueprint: {
    ...baseConfig,
  },
};

export function getConfig(variantName) {
  return variantConfigs[variantName] || variantConfigs.sandbox;
}

export const VARIANT_NAMES = ['sandbox', 'bloom', 'orderBoard', 'lineLevel', 'pressure', 'blueprint'];

export const VARIANT_LABELS = {
  sandbox: 'Sandbox',
  bloom: 'Triple Bloom',
  orderBoard: 'Order Board',
  lineLevel: 'Line Level',
  pressure: 'Pressure Cooker',
  blueprint: 'Blueprint',
};
