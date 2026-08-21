import { baseConfig } from '../config/config.js';
import { UNDERFLOW_RULES } from '../core/ops.js';

const STORAGE_KEY = 'operatorBlocks:settings';

export const OPERATOR_KEYS = ['none', 'plus1', 'minus1', 'x2', 'div2'];

export const OPERATOR_LABELS = {
  none: 'Blank',
  plus1: '+1',
  minus1: '-1',
  x2: '×2',
  div2: '÷2',
};

export function defaultSettings() {
  return {
    startValue: baseConfig.startValue,
    maxValue: baseConfig.maxValue,
    underflowRule: baseConfig.underflowRule,
    operatorWeights: { ...baseConfig.operatorWeights },
  };
}

function sanitize(raw) {
  const defaults = defaultSettings();
  if (!raw || typeof raw !== 'object') return defaults;

  const startValue =
    raw.startValue === 'random'
      ? 'random'
      : Number.isFinite(Number(raw.startValue))
        ? Math.max(0, Math.floor(Number(raw.startValue)))
        : defaults.startValue;

  const maxValue = Number.isFinite(Number(raw.maxValue))
    ? Math.max(1, Math.floor(Number(raw.maxValue)))
    : defaults.maxValue;

  const underflowRule = UNDERFLOW_RULES.includes(raw.underflowRule)
    ? raw.underflowRule
    : defaults.underflowRule;

  const operatorWeights = { ...defaults.operatorWeights };
  if (raw.operatorWeights && typeof raw.operatorWeights === 'object') {
    for (const key of OPERATOR_KEYS) {
      const weight = Number(raw.operatorWeights[key]);
      if (Number.isFinite(weight) && weight >= 0) operatorWeights[key] = weight;
    }
  }
  // Every weight at zero would make block generation impossible, so fall
  // back rather than hand the RNG a degenerate table.
  if (OPERATOR_KEYS.every((k) => operatorWeights[k] === 0)) {
    Object.assign(operatorWeights, defaults.operatorWeights);
  }
  // Likewise, a block is re-rolled until it has a non-'none' cell - if
  // every non-blank weight is zero that loop can never terminate.
  if (OPERATOR_KEYS.filter((k) => k !== 'none').every((k) => operatorWeights[k] === 0)) {
    operatorWeights.plus1 = defaults.operatorWeights.plus1;
  }

  return { startValue, maxValue, underflowRule, operatorWeights };
}

export function loadSettings() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable (private window); settings just won't persist */
  }
}

export function resetSettings() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
  return defaultSettings();
}

// Merge the playtester's live settings over a variant's config defaults.
export function applySettings(config, settings) {
  return {
    ...config,
    startValue: settings.startValue,
    maxValue: settings.maxValue,
    underflowRule: settings.underflowRule,
    operatorWeights: { ...settings.operatorWeights },
  };
}

// Weights are entered as percentages for legibility but stored as raw
// numbers; the RNG normalizes, so they never have to sum to exactly 100.
export function weightsAsPercent(operatorWeights) {
  const total = OPERATOR_KEYS.reduce((sum, k) => sum + operatorWeights[k], 0) || 1;
  return OPERATOR_KEYS.reduce((acc, k) => {
    acc[k] = Math.round((operatorWeights[k] / total) * 1000) / 10;
    return acc;
  }, {});
}
