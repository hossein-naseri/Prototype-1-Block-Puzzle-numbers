import { getConfig, VARIANT_NAMES, VARIANT_LABELS } from '../config/config.js';
import { getVariant } from '../variants/index.js';
import { createGame, placeBlock, previewPlacement, getHudState } from '../core/engine.js';
import { seedFromString, randomSeed } from '../core/rng.js';
import {
  renderBoard,
  renderBlockGlyph,
  renderQuotas,
  pulseQuotas,
  showPreview,
  clearPreview,
  shakeCells,
  flashCells,
} from './renderer.js';
import { createLogger } from './logging.js';
import {
  loadSettings,
  saveSettings,
  resetSettings,
  applySettings,
  asPercent,
  OPERATOR_KEYS,
  OPERATOR_LABELS,
  BLOCK_SIZES,
  BLOCK_SIZE_LABELS,
} from './settings.js';

const boardEl = document.getElementById('board');
const rowQuotasEl = document.getElementById('row-quotas');
const colQuotasEl = document.getElementById('col-quotas');
const handEl = document.getElementById('hand');
const nextHandEl = document.getElementById('next-hand');
const scoreEl = document.getElementById('score');
const strikesEl = document.getElementById('strikes');
const strikesReadoutEl = document.getElementById('strikes-readout');
const turnsEl = document.getElementById('turns');
const hudEl = document.getElementById('hud');
const variantSelectEl = document.getElementById('variant-select');
const seedInputEl = document.getElementById('seed-input');
const seedCopyBtn = document.getElementById('seed-copy');
const restartBtn = document.getElementById('restart-btn');
const gameOverEl = document.getElementById('game-over');
const exportBtn = document.getElementById('export-log');

const boardSizeEl = document.getElementById('set-board-size');
const maxValueEl = document.getElementById('set-max-value');
const maxStrikesEl = document.getElementById('set-max-strikes');
const threatsPerTurnEl = document.getElementById('set-threats-per-turn');
const threatMaxStacksEl = document.getElementById('set-threat-max-stacks');
const controlThresholdEl = document.getElementById('set-control-threshold');
const startValueEl = document.getElementById('set-start-value');
const startRandomEl = document.getElementById('set-start-random');
const blockSizeRowsEl = document.getElementById('block-size-rows');
const weightRowsEl = document.getElementById('weight-rows');
const settingsResetEl = document.getElementById('settings-reset');

let variantName;
let seed;
let variant;
let config;
let state;
let logger;
let settings = loadSettings();
let selectedBlockId = null;

function readParams() {
  const params = new URLSearchParams(location.search);
  variantName = params.get('variant') || 'lineLevel';
  if (!VARIANT_NAMES.includes(variantName)) variantName = 'lineLevel';
  const seedParam = params.get('seed');
  seed = seedParam ? seedFromString(seedParam) : randomSeed();
}

function writeParams() {
  const params = new URLSearchParams();
  params.set('variant', variantName);
  params.set('seed', String(seed));
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
}

function startGame() {
  variant = getVariant(variantName);
  config = applySettings(getConfig(variantName), settings);
  state = createGame(variant, config, seed);
  selectedBlockId = null;
  gameOverEl.hidden = true;
  seedInputEl.value = String(seed);
  writeParams();
  if (logger) logger.endSession(state);
  // The ruleset is recorded with the session - without it the placement
  // data can't be interpreted, since two runs of the same seed under
  // different settings aren't comparable.
  logger = createLogger(variantName, seed, {
    boardSize: config.boardSize,
    startValue: config.startValue,
    maxValue: config.maxValue,
    maxStrikes: config.maxStrikes,
    blockSizeWeights: config.blockSizeWeights,
    operatorWeights: config.operatorWeights,
    threatsPerTurn: config.threatsPerTurn ?? null,
    threatMaxStacks: config.threatMaxStacks ?? null,
    controlThreshold: config.controlThreshold ?? null,
  });
  render();
}

function render() {
  const usesQuotas = variant.usesLineQuotas !== false;
  renderBoard(
    boardEl,
    state.board,
    {
      onCellPointerEnter: (r, c) => onCellHover(r, c),
      onCellPointerUp: (r, c) => onCellDrop(r, c),
      onCellClick: (r, c) => onCellClick(r, c),
    },
    state.variantState.threats || null
  );

  rowQuotasEl.hidden = !usesQuotas;
  colQuotasEl.hidden = !usesQuotas;
  if (usesQuotas) {
    renderQuotas(rowQuotasEl, state.rowQuotas, state.rowChecked, 'row');
    renderQuotas(colQuotasEl, state.colQuotas, state.colChecked, 'col');
  }

  renderHand();
  scoreEl.textContent = String(state.score);
  // Strikes don't exist in the signed modes - Fight has its own win/lose.
  strikesReadoutEl.hidden = Boolean(config.signedValues);
  strikesEl.textContent = `${state.strikes} / ${config.maxStrikes}`;
  strikesReadoutEl.classList.toggle('danger', state.strikes >= config.maxStrikes - 1);
  turnsEl.textContent = String(state.turns);
  renderHud();

  if (state.gameOver) {
    gameOverEl.hidden = false;
    gameOverEl.classList.toggle('win', state.won);
    if (state.won) {
      gameOverEl.textContent = state.outcomeReason
        ? `You win — ${state.outcomeReason}`
        : `All quotas met — you win! ${state.turns} turns`;
    } else if (state.outcomeReason) {
      gameOverEl.textContent = `Defeat — ${state.outcomeReason}`;
    } else if (!config.signedValues && state.strikes >= config.maxStrikes) {
      gameOverEl.textContent = `${state.strikes} strikes — out. Score ${state.score}`;
    } else {
      gameOverEl.textContent = `No legal moves left. Score ${state.score}`;
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
    slot.addEventListener('pointerdown', () => startDrag(block.id));
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
  const { legal, strikes, absCells } = previewPlacement(state, selectedBlockId, r, c);
  showPreview(boardEl, state.board, absCells, legal, strikes);
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

  const struck = result.events.find((e) => e.type === 'strike');
  if (struck) flashCells(boardEl, struck.cells, 'strike-flash');
  else if (result.placement) flashCells(boardEl, result.placement.changedCells);

  const met = result.events.find((e) => e.type === 'quotaMet');
  if (met) pulseQuotas(rowQuotasEl, colQuotasEl, met.lines);

  const converted = result.events.find((e) => e.type === 'convert');
  if (converted) flashCells(boardEl, converted.flips);
  const landed = result.events.find((e) => e.type === 'threatLanded');
  if (landed) flashCells(boardEl, landed.cells, 'strike-flash');
}

// Minimal drag support: pointerdown on a hand slot starts a drag; the board
// cell under the pointer is previewed as it moves, and release commits.
let dragging = null;

function startDrag(blockId) {
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

// ---- Settings panel -------------------------------------------------

function renderWeightRows(container, keys, labels, weightsKey) {
  const pct = asPercent(settings[weightsKey], keys);
  container.innerHTML = '';
  for (const key of keys) {
    const row = document.createElement('label');
    row.className = 'weight-row';

    const label = document.createElement('span');
    label.innerHTML = `${labels[key]} <span class="pct">${pct[key]}%</span>`;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '0.05';
    input.value = String(settings[weightsKey][key]);
    input.addEventListener('change', () => {
      const weight = Number(input.value);
      if (!Number.isFinite(weight) || weight < 0) return;
      settings = { ...settings, [weightsKey]: { ...settings[weightsKey], [key]: weight } };
      commitSettings();
    });

    row.append(label, input);
    container.appendChild(row);
  }
}

function renderSettingsPanel() {
  boardSizeEl.value = String(settings.boardSize);
  maxValueEl.value = String(settings.maxValue);
  maxStrikesEl.value = String(settings.maxStrikes);
  threatsPerTurnEl.value = String(settings.threatsPerTurn);
  threatMaxStacksEl.value = String(settings.threatMaxStacks);
  controlThresholdEl.value = String(settings.controlPercent);
  // The Fight-only knobs are dead weight in the other modes.
  for (const el of document.querySelectorAll('.fight-only')) el.hidden = variantName !== 'fight';

  const isRandom = settings.startValue === 'random';
  startRandomEl.checked = isRandom;
  startValueEl.disabled = isRandom;
  startValueEl.value = isRandom ? '' : String(settings.startValue);

  renderWeightRows(blockSizeRowsEl, BLOCK_SIZES, BLOCK_SIZE_LABELS, 'blockSizeWeights');
  renderWeightRows(weightRowsEl, OPERATOR_KEYS, OPERATOR_LABELS, 'operatorWeights');
}

// Every settings change restarts the run - the values it controls (board
// size, start tiles, weights, caps) are all baked in at deal time, so
// applying them mid-run would produce a board matching neither ruleset.
function commitSettings() {
  saveSettings(settings);
  renderSettingsPanel();
  startGame();
}

function bindNumberSetting(el, key, min) {
  el.addEventListener('change', () => {
    const value = Number(el.value);
    if (!Number.isFinite(value)) return;
    settings = { ...settings, [key]: Math.max(min, Math.floor(value)) };
    commitSettings();
  });
}

bindNumberSetting(boardSizeEl, 'boardSize', 2);
bindNumberSetting(maxValueEl, 'maxValue', 1);
bindNumberSetting(maxStrikesEl, 'maxStrikes', 1);
bindNumberSetting(threatsPerTurnEl, 'threatsPerTurn', 0);
bindNumberSetting(threatMaxStacksEl, 'threatMaxStacks', 1);
bindNumberSetting(controlThresholdEl, 'controlPercent', 1);
bindNumberSetting(startValueEl, 'startValue', 0);

startRandomEl.addEventListener('change', () => {
  settings = { ...settings, startValue: startRandomEl.checked ? 'random' : 0 };
  commitSettings();
});

settingsResetEl.addEventListener('click', () => {
  settings = resetSettings();
  commitSettings();
});

variantSelectEl.addEventListener('change', () => {
  variantName = variantSelectEl.value;
  renderSettingsPanel();
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

readParams();
populateVariantSelect();
renderSettingsPanel();
startGame();
