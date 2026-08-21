import { createBoard, applyMutations } from './board.js';
import { generateHand, absoluteCells } from './blocks.js';
import { canPlace, noLegalPlacements } from './legality.js';
import { applyPlacement } from './resolve.js';
import { SeededRng } from './rng.js';

// The core engine knows nothing about *why* a placement resolves the way it
// does past the numeric legality rules - that's entirely delegated to the
// active variant module, which implements:
//   init(config, rng) -> { board?, variantState, hudExtra? }        (optional)
//   getNextHand(rng, config, variantState) -> { hand: Block[], variantState } (optional;
//       default draws a random hand and leaves variantState untouched. A
//       variant that deals a *scripted* hand sequence - e.g. Blueprint -
//       advances its own pointer through the returned variantState, since
//       this is the only hook the engine calls outside onPlacementResolved.)
//   onPlacementResolved(board, placement, variantState, config)
//       -> { mutations, scoreDelta, events, variantState? }
//   isGameOver(board, hand, variantState, config) -> bool
//   getHudState(board, variantState, config) -> {}
//   checkWin(board, variantState, config) -> bool                    (optional)

function defaultNextHand(rng, config, variantState) {
  return { hand: generateHand(rng, config, config.handSize ?? 3), variantState };
}

export function createGame(variant, config, seed) {
  const rng = new SeededRng(seed);
  let board = createBoard(config.boardSize);
  let variantState = {};

  if (variant.init) {
    const initResult = variant.init(config, rng) || {};
    if (initResult.board) board = initResult.board;
    if (initResult.variantState) variantState = initResult.variantState;
  }

  const nextHandFn = variant.getNextHand || defaultNextHand;
  const first = nextHandFn(rng, config, variantState);
  variantState = first.variantState;
  const hand = first.hand;
  const second = nextHandFn(rng, config, variantState);
  variantState = second.variantState;
  const nextHand = second.hand;

  return {
    variantName: variant.name,
    config,
    seed,
    rng,
    board,
    hand,
    nextHand,
    variantState,
    score: 0,
    turns: 0,
    gameOver: false,
    won: false,
    lastEvents: [],
    illegalAttempts: 0,
  };
}

export function previewPlacement(state, blockId, anchorR, anchorC) {
  const block = state.hand.find((b) => b.id === blockId);
  if (!block) return { legal: false, absCells: [] };
  const absCells = absoluteCells(block, anchorR, anchorC);
  return { legal: canPlace(state.board, absCells), absCells };
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

  const { board: boardAfterCore, changedCells } = applyPlacement(state.board, absCells);
  const placement = { block, absCells, changedCells };

  const result = variant.onPlacementResolved(boardAfterCore, placement, state.variantState, state.config) || {};
  const mutations = result.mutations || [];
  const scoreDelta = result.scoreDelta || 0;
  const events = result.events || [];
  let variantState = result.variantState || state.variantState;

  const finalBoard = applyMutations(boardAfterCore, mutations);

  let hand = state.hand.filter((b) => b.id !== blockId);
  let nextHand = state.nextHand;
  const nextHandFn = variant.getNextHand || defaultNextHand;
  if (hand.length === 0) {
    hand = nextHand;
    const drawn = nextHandFn(state.rng, state.config, variantState);
    nextHand = drawn.hand;
    variantState = drawn.variantState;
  }

  const won = variant.checkWin ? variant.checkWin(finalBoard, variantState, state.config) : false;
  const gameOver =
    won || (variant.isGameOver ? variant.isGameOver(finalBoard, hand, variantState, state.config) : false);

  const nextState = {
    ...state,
    board: finalBoard,
    hand,
    nextHand,
    variantState,
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
