// All the "starting values, not constants" from the design brief live here.
// Each variant config extends the shared base below.

export const baseConfig = {
  boardSize: 4,
  handSize: 3,
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
    cap: 12,
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
