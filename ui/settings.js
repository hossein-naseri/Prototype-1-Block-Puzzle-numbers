import { baseConfig } from '../config/config.js';
import { OPERATOR_KEYS } from '../core/ops.js';
import { BLOCK_SIZES } from '../core/shapes.js';

const STORAGE_KEY = 'operatorBlocks:settings';

export { OPERATOR_KEYS, BLOCK_SIZES };

export const OPERATOR_LABELS = {
  none: 'Blank',
  plus1: '+1',
  minus1: '-1',
  x2: '×2',
  div2: '÷2',
};

export const BLOCK_SIZE_LABELS = {
  1: '1 tile',
  2: '2 tiles',
  3: '3 tiles',
};

export function defaultSettings() {
  return {
    boardSize: baseConfig.boardSize,
    startValue: baseConfig.startValue,
    maxValue: baseConfig.maxValue,
    maxStrikes: baseConfig.maxStrikes,
    blockSizeWeights: { ...baseConfig.blockSizeWeights },
    operatorWeights: { ...baseConfig.operatorWeights },
  };
}

function intOr(raw, fallback, min) {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(min, Math.floor(value)) : fallback;
}

function sanitizeWeights(raw, keys, defaults, needNonZero) {
  const weights = { ...defaults };
  if (raw && typeof raw === 'object') {
    for (const key of keys) {
      const weight = Number(raw[key]);
      if (Number.isFinite(weight) && weight >= 0) weights[key] = weight;
    }
  }
  // An all-zero table would make the weighted draw meaningless, and for
  // operators a table with only 'none' would spin the "must carry at least
  // one operator" re-roll forever.
  if (needNonZero.every((k) => weights[k] === 0)) {
    for (const k of needNonZero) weights[k] = defaults[k];
  }
  return weights;
}

function sanitize(raw) {
  const defaults = defaultSettings();
  if (!raw || typeof raw !== 'object') return defaults;

  const startValue =
    raw.startValue === 'random' ? 'random' : intOr(raw.startValue, defaults.startValue, 0);

  return {
    boardSize: intOr(raw.boardSize, defaults.boardSize, 2),
    startValue,
    maxValue: intOr(raw.maxValue, defaults.maxValue, 1),
    maxStrikes: intOr(raw.maxStrikes, defaults.maxStrikes, 1),
    blockSizeWeights: sanitizeWeights(
      raw.blockSizeWeights,
      BLOCK_SIZES,
      defaults.blockSizeWeights,
      BLOCK_SIZES
    ),
    operatorWeights: sanitizeWeights(
      raw.operatorWeights,
      OPERATOR_KEYS,
      defaults.operatorWeights,
      OPERATOR_KEYS.filter((k) => k !== 'none')
    ),
  };
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
    boardSize: settings.boardSize,
    startValue: settings.startValue,
    maxValue: settings.maxValue,
    maxStrikes: settings.maxStrikes,
    blockSizeWeights: { ...settings.blockSizeWeights },
    operatorWeights: { ...settings.operatorWeights },
  };
}

// Weights are entered as raw numbers but shown as percentages, since that's
// how the brief talks about them. They never have to sum to 100.
export function asPercent(weights, keys) {
  const total = keys.reduce((sum, k) => sum + weights[k], 0) || 1;
  return keys.reduce((acc, k) => {
    acc[k] = Math.round((weights[k] / total) * 1000) / 10;
    return acc;
  }, {});
}
