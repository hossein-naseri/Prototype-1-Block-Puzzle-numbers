import { getConfig, VARIANT_NAMES, VARIANT_LABELS } from '../config/config.js';
import { getVariant } from '../variants/index.js';
import { createGame, placeBlock, previewPlacement, getHudState } from '../core/engine.js';
import { seedFromString, randomSeed } from '../core/rng.js';
import {
  renderBoard,
  renderBlockGlyph,
  showPreview,
  clearPreview,
  shakeCells,
  flashCells,
} from './renderer.js';
import { createLogger } from './logging.js';

const boardEl = document.getElementById('board');
const handEl = document.getElementById('hand');
const nextHandEl = document.getElementById('next-hand');
const scoreEl = document.getElementById('score');
const turnsEl = document.getElementById('turns');
const hudEl = document.getElementById('hud');
const variantSelectEl = document.getElementById('variant-select');
const seedInputEl = document.getElementById('seed-input');
const seedCopyBtn = document.getElementById('seed-copy');
const restartBtn = document.getElementById('restart-btn');
const gameOverEl = document.getElementById('game-over');
const exportBtn = document.getElementById('export-log');

let variantName;
let seed;
let variant;
let config;
let state;
let logger;
let selectedBlockId = null;

function readParams() {
  const params = new URLSearchParams(location.search);
  variantName = params.get('variant') || 'sandbox';
  if (!VARIANT_NAMES.includes(variantName)) variantName = 'sandbox';
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
  config = getConfig(variantName);
  state = createGame(variant, config, seed);
  selectedBlockId = null;
  gameOverEl.hidden = true;
  seedInputEl.value = String(seed);
  writeParams();
  if (logger) logger.endSession(state);
  logger = createLogger(variantName, seed);
  render();
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
  if (state.gameOver) {
    gameOverEl.hidden = false;
    gameOverEl.textContent = state.won ? 'Solved!' : `Game over — score ${state.score}`;
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
  const { legal, absCells } = previewPlacement(state, selectedBlockId, r, c);
  showPreview(boardEl, state.board, absCells, legal);
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
startGame();
