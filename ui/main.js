import { getConfig, VARIANT_NAMES, VARIANT_LABELS } from '../config/config.js';
import { getVariant } from '../variants/index.js';
import { createGame, placeBlock, previewPlacement, getHudState } from '../core/engine.js';
import { seedFromString, randomSeed } from '../core/rng.js';
import {
  renderBoard,
  renderBlockGlyph,
  renderTargetGrid,
  showPreview,
  clearPreview,
  shakeCells,
  flashCells,
} from './renderer.js';
import { createLogger } from './logging.js';
import { LEVELS } from '../config/levels.js';
import { UNDERFLOW_RULES, UNDERFLOW_LABELS, UNDERFLOW_HELP } from '../core/ops.js';
import {
  loadSettings,
  saveSettings,
  resetSettings,
  applySettings,
  weightsAsPercent,
  OPERATOR_KEYS,
  OPERATOR_LABELS,
} from './settings.js';

const boardEl = document.getElementById('board');
const handEl = document.getElementById('hand');
const nextHandEl = document.getElementById('next-hand');
const scoreEl = document.getElementById('score');
const turnsEl = document.getElementById('turns');
const hudEl = document.getElementById('hud');
const variantSelectEl = document.getElementById('variant-select');
const levelSelectEl = document.getElementById('level-select');
const seedRowEl = document.getElementById('seed-row');
const seedInputEl = document.getElementById('seed-input');
const seedCopyBtn = document.getElementById('seed-copy');
const restartBtn = document.getElementById('restart-btn');
const gameOverEl = document.getElementById('game-over');
const exportBtn = document.getElementById('export-log');
const targetWrapEl = document.getElementById('target-wrap');
const targetBoardEl = document.getElementById('target-board');
const underflowSelectEl = document.getElementById('set-underflow');
const underflowHelpEl = document.getElementById('underflow-help');
const startValueEl = document.getElementById('set-start-value');
const startRandomEl = document.getElementById('set-start-random');
const maxValueEl = document.getElementById('set-max-value');
const weightRowsEl = document.getElementById('weight-rows');
const settingsResetEl = document.getElementById('settings-reset');

let variantName;
let seed;
let levelIndex = 0;
let variant;
let config;
let state;
let logger;
let settings = loadSettings();
let selectedBlockId = null;

function readParams() {
  const params = new URLSearchParams(location.search);
  variantName = params.get('variant') || 'sandbox';
  if (!VARIANT_NAMES.includes(variantName)) variantName = 'sandbox';
  const seedParam = params.get('seed');
  seed = seedParam ? seedFromString(seedParam) : randomSeed();
  const levelParam = Number(params.get('level'));
  levelIndex = Number.isInteger(levelParam) && LEVELS[levelParam] ? levelParam : 0;
}

function writeParams() {
  const params = new URLSearchParams();
  params.set('variant', variantName);
  if (variantName === 'blueprint') {
    params.set('level', String(levelIndex));
  } else {
    params.set('seed', String(seed));
  }
  history.replaceState(null, '', `?${params.toString()}`);
}

function populateVariantSelect() {
  variantSelectEl.innerHTML = '';
  for (const name of VARIANT_NAMES) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = VARIANT_LABELS[name];
    variantSelectEl.appendChild(opt);
  }
  variantSelectEl.value = variantName;

  levelSelectEl.innerHTML = '';
  LEVELS.forEach((level, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = level.name;
    levelSelectEl.appendChild(opt);
  });
  levelSelectEl.value = String(levelIndex);
}

function startGame() {
  const isBlueprint = variantName === 'blueprint';
  levelSelectEl.hidden = !isBlueprint;
  seedRowEl.hidden = isBlueprint;
  targetWrapEl.hidden = !isBlueprint;

  variant = getVariant(variantName);
  config = applySettings(getConfig(variantName), settings);
  if (isBlueprint) {
    // Blueprint levels are authored objects with solver-verified pars, all
    // computed under strict legality. Letting the tuning panel change the
    // number rules out from under them would silently invalidate every par,
    // so levels always run strict and supply their own tile values.
    config = { ...config, level: LEVELS[levelIndex], underflowRule: 'strict', startValue: 0 };
  }
  state = createGame(variant, config, seed);
  selectedBlockId = null;
  gameOverEl.hidden = true;
  seedInputEl.value = String(seed);
  writeParams();
  if (logger) logger.endSession(state);
  // The ruleset is recorded with the session - without it the placement
  // data can't be interpreted, since two runs of the same seed under
  // different underflow rules aren't comparable.
  logger = createLogger(variantName, seed, {
    startValue: config.startValue,
    maxValue: config.maxValue,
    underflowRule: config.underflowRule,
    operatorWeights: config.operatorWeights,
    boardSize: config.boardSize,
    level: isBlueprint ? LEVELS[levelIndex].id : null,
  });
  render();
}

function renderSettingsPanel() {
  underflowSelectEl.innerHTML = '';
  for (const rule of UNDERFLOW_RULES) {
    const opt = document.createElement('option');
    opt.value = rule;
    opt.textContent = UNDERFLOW_LABELS[rule];
    underflowSelectEl.appendChild(opt);
  }
  underflowSelectEl.value = settings.underflowRule;
  underflowHelpEl.textContent = UNDERFLOW_HELP[settings.underflowRule];

  const isRandom = settings.startValue === 'random';
  startRandomEl.checked = isRandom;
  startValueEl.disabled = isRandom;
  startValueEl.value = isRandom ? '' : String(settings.startValue);
  maxValueEl.value = String(settings.maxValue);

  const pct = weightsAsPercent(settings.operatorWeights);
  weightRowsEl.innerHTML = '';
  for (const key of OPERATOR_KEYS) {
    const row = document.createElement('label');
    row.className = 'weight-row';
    const label = document.createElement('span');
    label.innerHTML = `${OPERATOR_LABELS[key]} <span class="pct">${pct[key]}%</span>`;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '0.005';
    input.value = String(settings.operatorWeights[key]);
    input.addEventListener('change', () => {
      const weight = Number(input.value);
      if (!Number.isFinite(weight) || weight < 0) return;
      settings = { ...settings, operatorWeights: { ...settings.operatorWeights, [key]: weight } };
      commitSettings();
    });
    row.append(label, input);
    weightRowsEl.appendChild(row);
  }
}

// Every settings change restarts the run - the values it controls (start
// tiles, weights, number rules) are all baked in at deal time, so applying
// them mid-run would produce a board that matches neither ruleset.
function commitSettings() {
  saveSettings(settings);
  renderSettingsPanel();
  startGame();
}

function render() {
  renderBoard(
    boardEl,
    state.board,
    (r, c) => onCellHover(r, c),
    (r, c) => onCellDrop(r, c),
    (r, c) => onCellClick(r, c)
  );
  renderHand();
  scoreEl.textContent = String(state.score);
  turnsEl.textContent = String(state.turns);
  renderHud();
  if (variantName === 'blueprint') {
    renderTargetGrid(targetBoardEl, config.level.targetBoard, config.level.boardSize, state.board);
  }
  if (state.gameOver) {
    gameOverEl.hidden = false;
    const underflowed = state.lastEvents.some((e) => e.type === 'underflowLoss');
    if (variantName === 'blueprint') {
      gameOverEl.textContent = state.won ? `Solved in ${state.turns} (par ${config.level.par})!` : 'Out of moves';
    } else if (underflowed) {
      gameOverEl.textContent = `Below zero — run ended. Score ${state.score}`;
    } else {
      gameOverEl.textContent = state.won ? 'Solved!' : `Game over — score ${state.score}`;
    }
    if (logger) logger.endSession(state);
  }
}

function renderHud() {
  const hud = getHudState(variant, state);
  const parts = Object.entries(hud).map(([k, v]) => `${k}: ${v}`);
  hudEl.textContent = parts.join('  ·  ');
}

function renderHand() {
  handEl.innerHTML = '';
  for (const block of state.hand) {
    const slot = document.createElement('button');
    slot.className = 'hand-slot';
    slot.type = 'button';
    if (block.id === selectedBlockId) slot.classList.add('selected');
    slot.appendChild(renderBlockGlyph(block));
    slot.addEventListener('click', () => selectBlock(block.id));
    slot.addEventListener('pointerdown', (e) => startDrag(e, block.id));
    handEl.appendChild(slot);
  }

  nextHandEl.innerHTML = '';
  for (const block of state.nextHand) {
    nextHandEl.appendChild(renderBlockGlyph(block));
  }
}

function selectBlock(blockId) {
  selectedBlockId = selectedBlockId === blockId ? null : blockId;
  clearPreview(boardEl);
  renderHand();
}

function onCellHover(r, c) {
  if (!selectedBlockId || dragging) return;
  const { legal, fatal, absCells } = previewPlacement(state, selectedBlockId, r, c);
  showPreview(boardEl, state.board, absCells, legal, fatal);
}

function onCellClick(r, c) {
  if (!selectedBlockId) return;
  commitPlacement(selectedBlockId, r, c);
}

function onCellDrop(r, c) {
  if (!dragging) return;
  commitPlacement(dragging.blockId, r, c);
}

function commitPlacement(blockId, r, c) {
  const result = placeBlock(variant, state, blockId, r, c);
  if (!result.ok) {
    const { absCells } = previewPlacement(state, blockId, r, c);
    shakeCells(boardEl, absCells);
    if (logger) logger.logIllegalAttempt(state, blockId, r, c);
    state = result.state;
    return;
  }
  if (logger) logger.logPlacement(state, result);
  state = result.state;
  selectedBlockId = null;
  clearPreview(boardEl);
  render();
  if (result.placement) flashCells(boardEl, result.placement.changedCells);
}

// Minimal drag support: pointerdown on a hand slot starts a drag; the board
// cell under the pointer is previewed as it moves, and release commits.
let dragging = null;

function startDrag(e, blockId) {
  selectedBlockId = blockId;
  renderHand();
  dragging = { blockId };
  const move = (ev) => {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const cellEl = el && el.closest('.cell');
    if (cellEl) onCellHover(Number(cellEl.dataset.r), Number(cellEl.dataset.c));
  };
  const up = (ev) => {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const cellEl = el && el.closest('.cell');
    if (cellEl) commitPlacement(blockId, Number(cellEl.dataset.r), Number(cellEl.dataset.c));
    dragging = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

variantSelectEl.addEventListener('change', () => {
  variantName = variantSelectEl.value;
  startGame();
});

levelSelectEl.addEventListener('change', () => {
  levelIndex = Number(levelSelectEl.value);
  startGame();
});

restartBtn.addEventListener('click', () => {
  startGame();
});

seedInputEl.addEventListener('change', () => {
  seed = seedFromString(seedInputEl.value);
  startGame();
});

seedCopyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(String(seed));
    seedCopyBtn.textContent = 'Copied!';
    setTimeout(() => (seedCopyBtn.textContent = 'Copy'), 1000);
  } catch {
    /* clipboard may be unavailable; ignore */
  }
});

exportBtn.addEventListener('click', () => {
  createLogger.exportAll();
});

underflowSelectEl.addEventListener('change', () => {
  settings = { ...settings, underflowRule: underflowSelectEl.value };
  commitSettings();
});

startRandomEl.addEventListener('change', () => {
  settings = { ...settings, startValue: startRandomEl.checked ? 'random' : 0 };
  commitSettings();
});

startValueEl.addEventListener('change', () => {
  const value = Math.max(0, Math.floor(Number(startValueEl.value)));
  if (!Number.isFinite(value)) return;
  settings = { ...settings, startValue: value };
  commitSettings();
});

maxValueEl.addEventListener('change', () => {
  const value = Math.max(1, Math.floor(Number(maxValueEl.value)));
  if (!Number.isFinite(value)) return;
  settings = { ...settings, maxValue: value };
  commitSettings();
});

settingsResetEl.addEventListener('click', () => {
  settings = resetSettings();
  commitSettings();
});

readParams();
populateVariantSelect();
renderSettingsPanel();
startGame();

// Console dev tool: import('./core/solver.js').then(...) works too, but this
// saves a trip - open devtools and run e.g.
//   OperatorBlocks.solveAllLevels()
import('../core/solver.js').then(({ solveLevel, solveAllLevels }) => {
  window.OperatorBlocks = {
    LEVELS,
    solveLevel: (levelIndexArg = levelIndex) =>
      solveLevel(getVariant('blueprint'), LEVELS[levelIndexArg], getConfig('blueprint')),
    solveAllLevels: () => solveAllLevels(getVariant('blueprint'), LEVELS, getConfig('blueprint')),
  };
});
