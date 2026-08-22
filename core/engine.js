import { createBoard, applyMutations } from './board.js';
import { generateHand, absoluteCells } from './blocks.js';
import { canPlace, noLegalPlacements, anyPlacementForBlock } from './legality.js';
import { applyPlacement } from './resolve.js';
import { opWouldStrike } from './ops.js';
import { SeededRng } from './rng.js';

// The core engine owns the number rules (clamping, the strike cap), the
// per-column score bars, and the win/lose conditions. What *counts* as
// scoring is the one thing it delegates: each variant decides which tiles
// convert to score and when, and reports them back.
//
// Variant interface:
//   init(config, rng) -> { board?, variantState }                   (optional)
//   getNextHand(rng, config, variantState) -> { hand, variantState } (optional)
//   onPlacementResolved(board, placement, variantState, config)
//       -> { mutations, scoredTiles, events, variantState? }
//          scoredTiles: [{ r, c, value }] - tiles whose number was turned
//          into score this placement. The engine squares each value, adds
//          it to that tile's column bar, and adds it to the total score.
//   isGameOver(board, hand, variantState, config) -> bool           (optional)
//   getHudState(board, variantState, config) -> {}                  (optional)

const MAX_DEAL_ATTEMPTS = 40;

function defaultNextHand(rng, config, variantState) {
  return { hand: generateHand(rng, config, config.handSize ?? 3), variantState };
}

function handIsPlayable(board, hand) {
  return hand.some((block) => anyPlacementForBlock(board, block, absoluteCells) !== null);
}

// Draws a hand, re-rolling while it has no legal placement anywhere. With
// clamping this is rarely needed, but it costs nothing and guarantees a
// deal is always playable.
function dealHand(variant, rng, config, variantState, board) {
  const nextHandFn = variant.getNextHand || defaultNextHand;
  if (variant.getNextHand) return nextHandFn(rng, config, variantState);

  let drawn = nextHandFn(rng, config, variantState);
  for (let attempt = 1; attempt < MAX_DEAL_ATTEMPTS; attempt++) {
    if (handIsPlayable(board, drawn.hand)) break;
    drawn = nextHandFn(rng, config, variantState);
  }
  return drawn;
}

// Per-tile starting value. 'random' picks strictly between 0 and maxValue,
// excluding both ends, so no tile starts already at zero or already capped.
function applyStartValues(board, config, rng) {
  const startValue = config.startValue ?? 0;
  if (startValue === 0) return board;

  const maxValue = config.maxValue ?? 9;
  for (const cell of board.cells) {
    if (startValue === 'random') {
      const span = maxValue - 1; // candidates are 1 .. maxValue-1
      cell.value = span >= 1 ? 1 + rng.int(span) : 0;
    } else {
      cell.value = Math.min(startValue, maxValue);
    }
  }
  return board;
}

// Squared tile value is the single score formula: a scored 4 is worth 16,
// both to the running score and to that tile's column bar.
export function tileScore(value) {
  return value * value;
}

function barsFull(bars, capacity) {
  return bars.length > 0 && bars.every((fill) => fill >= capacity);
}

export function createGame(variant, config, seed) {
  const rng = new SeededRng(seed);
  let board = createBoard(config.boardSize);
  let variantState = {};
  let usedVariantBoard = false;

  if (variant.init) {
    const initResult = variant.init(config, rng) || {};
    if (initResult.board) {
      board = initResult.board;
      usedVariantBoard = true;
    }
    if (initResult.variantState) variantState = initResult.variantState;
  }

  if (!usedVariantBoard) applyStartValues(board, config, rng);

  const first = dealHand(variant, rng, config, variantState, board);
  variantState = first.variantState;
  const hand = first.hand;
  const second = dealHand(variant, rng, config, variantState, board);
  variantState = second.variantState;
  const nextHand = second.hand;

  const gameOver = variant.isGameOver ? variant.isGameOver(board, hand, variantState, config) : false;

  return {
    variantName: variant.name,
    config,
    seed,
    rng,
    board,
    hand,
    nextHand,
    variantState,
    bars: new Array(board.size).fill(0),
    strikes: 0,
    score: 0,
    turns: 0,
    gameOver,
    won: false,
    lastEvents: [],
    illegalAttempts: 0,
  };
}

export function previewPlacement(state, blockId, anchorR, anchorC) {
  const block = state.hand.find((b) => b.id === blockId);
  if (!block) return { legal: false, strikes: 0, absCells: [] };

  const absCells = absoluteCells(block, anchorR, anchorC);
  const legal = canPlace(state.board, absCells);

  // A placement can be perfectly legal and still cost strikes. The UI warns
  // before the player commits, so the cap is a visible tradeoff.
  let strikes = 0;
  if (legal) {
    for (const { r, c, op } of absCells) {
      const cell = state.board.cells[r * state.board.size + c];
      if (opWouldStrike(op, cell.value, state.config.maxValue)) strikes += 1;
    }
  }

  return { legal, strikes, absCells };
}

export function placeBlock(variant, state, blockId, anchorR, anchorC) {
  const block = state.hand.find((b) => b.id === blockId);
  if (!block || state.gameOver) {
    return { ok: false, reason: 'no-block', state };
  }

  const absCells = absoluteCells(block, anchorR, anchorC);
  if (!canPlace(state.board, absCells)) {
    return {
      ok: false,
      reason: 'illegal',
      state: { ...state, illegalAttempts: state.illegalAttempts + 1 },
    };
  }

  const { board: boardAfterCore, changedCells, strikesAdded } = applyPlacement(
    state.board,
    absCells,
    state.config.maxValue
  );
  const placement = { block, absCells, changedCells };

  const result = variant.onPlacementResolved(boardAfterCore, placement, state.variantState, state.config) || {};
  const mutations = result.mutations || [];
  const scoredTiles = result.scoredTiles || [];
  const events = [...(result.events || [])];
  let variantState = result.variantState || state.variantState;

  if (strikesAdded > 0) {
    events.push({ type: 'strike', count: strikesAdded, cells: changedCells.filter((c) => c.struck) });
  }

  const finalBoard = applyMutations(boardAfterCore, mutations);

  // Each scored tile fills the bar above its own column.
  const bars = [...state.bars];
  let scoreDelta = 0;
  for (const { c, value } of scoredTiles) {
    const gained = tileScore(value);
    scoreDelta += gained;
    if (c >= 0 && c < bars.length) bars[c] += gained;
  }
  if (scoredTiles.length > 0) {
    events.push({ type: 'barFill', scoredTiles: scoredTiles.map((t) => ({ ...t, gained: tileScore(t.value) })) });
  }

  const strikes = state.strikes + strikesAdded;

  let hand = state.hand.filter((b) => b.id !== blockId);
  let nextHand = state.nextHand;
  if (hand.length === 0) {
    hand = nextHand;
    if (!variant.getNextHand && !handIsPlayable(finalBoard, hand)) {
      hand = dealHand(variant, state.rng, state.config, variantState, finalBoard).hand;
    }
    const drawn = dealHand(variant, state.rng, state.config, variantState, finalBoard);
    nextHand = drawn.hand;
    variantState = drawn.variantState;
  }

  // A placement can both fill the last bar and take the final strike. The
  // strike is applied during operator resolution, before the variant gets a
  // chance to score anything, so it lands first and the loss takes
  // precedence over the win.
  const lostToStrikes = strikes >= state.config.maxStrikes;
  const won = !lostToStrikes && barsFull(bars, state.config.barCapacity);
  const stuck = variant.isGameOver
    ? variant.isGameOver(finalBoard, hand, variantState, state.config)
    : false;
  const gameOver = won || lostToStrikes || stuck;

  if (lostToStrikes) events.push({ type: 'strikeOut', strikes });
  if (won) events.push({ type: 'win', bars });

  const nextState = {
    ...state,
    board: finalBoard,
    hand,
    nextHand,
    variantState,
    bars,
    strikes,
    score: state.score + scoreDelta,
    turns: state.turns + 1,
    gameOver,
    won,
    lastEvents: events,
  };

  return { ok: true, state: nextState, scoreDelta, events, placement };
}

export function getHudState(variant, state) {
  return variant.getHudState ? variant.getHudState(state.board, state.variantState, state.config) : {};
}

export { absoluteCells, noLegalPlacements };
