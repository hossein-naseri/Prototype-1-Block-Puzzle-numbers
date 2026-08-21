import { createBoard, applyMutations } from './board.js';
import { generateHand, absoluteCells } from './blocks.js';
import { canPlace, noLegalPlacements, anyPlacementForBlock } from './legality.js';
import { applyPlacement } from './resolve.js';
import { isFatalValue } from './ops.js';
import { SeededRng } from './rng.js';

// The core engine knows nothing about *why* a placement resolves the way it
// does past the numeric rules - that's entirely delegated to the active
// variant module, which implements:
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

// Cap on how many times a dead hand is re-drawn before giving up and
// letting the game-over check report it. Bounded so a pathological config
// (every weight on ÷2, say) can't spin forever.
const MAX_DEAL_ATTEMPTS = 40;

function defaultNextHand(rng, config, variantState) {
  return { hand: generateHand(rng, config, config.handSize ?? 3), variantState };
}

function handIsPlayable(board, hand, rule) {
  return hand.some((block) => anyPlacementForBlock(board, block, absoluteCells, rule) !== null);
}

// Draws a hand, re-rolling while it has no legal placement anywhere on the
// given board. This is what keeps the 'strict' rule from dealing an opening
// hand of nothing but -1 blocks onto an all-zero board (~26% of seeds
// before this existed). It is deliberately skipped for variants that script
// their own hands - a Blueprint level's sequence is authored, not drawn.
//
// Caveat worth knowing when comparing seeds: because a re-roll depends on
// the board, and boards diverge between variants once their rules start
// firing, a seed no longer guarantees an identical block sequence across
// variants past the point where a re-roll actually triggers. The opening
// deal is unaffected - every variant starts from the same board, so it
// re-rolls identically.
function dealHand(variant, rng, config, variantState, board) {
  const nextHandFn = variant.getNextHand || defaultNextHand;
  if (variant.getNextHand) return nextHandFn(rng, config, variantState);

  const rule = config.underflowRule;
  let drawn = nextHandFn(rng, config, variantState);
  for (let attempt = 1; attempt < MAX_DEAL_ATTEMPTS; attempt++) {
    if (handIsPlayable(board, drawn.hand, rule)) break;
    drawn = nextHandFn(rng, config, variantState);
  }
  return drawn;
}

// Per-tile starting value. 'random' picks strictly between 0 and maxValue,
// excluding both ends, so no tile starts already dead or already at zero.
function applyStartValues(board, config, rng) {
  const startValue = config.startValue ?? 0;
  if (startValue === 0) return board;

  const maxValue = config.maxValue ?? 12;
  for (const cell of board.cells) {
    if (startValue === 'random') {
      const span = maxValue - 1; // candidates are 1 .. maxValue-1
      cell.value = span >= 1 ? 1 + rng.int(span) : 0;
    } else {
      cell.value = startValue;
    }
  }
  return board;
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

  // A variant that authors its own board (Blueprint) owns its tile values.
  if (!usedVariantBoard) applyStartValues(board, config, rng);

  const first = dealHand(variant, rng, config, variantState, board);
  variantState = first.variantState;
  const hand = first.hand;
  const second = dealHand(variant, rng, config, variantState, board);
  variantState = second.variantState;
  const nextHand = second.hand;

  // The opening deal can still be dead on arrival when re-rolling can't fix
  // it (a scripted level, or a config where nothing is placeable). Evaluate
  // game-over here as well as after each placement, so that reports itself
  // instead of leaving the player tapping a board that only shakes.
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
  if (!block) return { legal: false, fatal: false, absCells: [] };
  const absCells = absoluteCells(block, anchorR, anchorC);
  const legal = canPlace(state.board, absCells, state.config.underflowRule);

  // Under 'instaLoss' a placement can be perfectly legal and still end the
  // run. The UI flags those separately so the mode is testable rather than
  // just baffling.
  let fatal = false;
  if (legal && state.config.underflowRule === 'instaLoss') {
    const { changedCells } = applyPlacement(state.board, absCells, state.config.underflowRule);
    fatal = changedCells.some((c) => isFatalValue(c.value, state.config.underflowRule));
  }

  return { legal, fatal, absCells };
}

export function placeBlock(variant, state, blockId, anchorR, anchorC) {
  const block = state.hand.find((b) => b.id === blockId);
  if (!block || state.gameOver) {
    return { ok: false, reason: 'no-block', state };
  }

  const rule = state.config.underflowRule;
  const absCells = absoluteCells(block, anchorR, anchorC);
  if (!canPlace(state.board, absCells, rule)) {
    return {
      ok: false,
      reason: 'illegal',
      state: { ...state, illegalAttempts: state.illegalAttempts + 1 },
    };
  }

  const { board: boardAfterCore, changedCells } = applyPlacement(state.board, absCells, rule);
  const placement = { block, absCells, changedCells };

  // Underflow under rule (b) ends the run on the spot. Short-circuit before
  // the variant resolves, so no variant has to reason about a tile holding
  // a negative value.
  if (changedCells.some((c) => isFatalValue(c.value, rule))) {
    const events = [{ type: 'underflowLoss', cells: changedCells.filter((c) => c.value < 0) }];
    return {
      ok: true,
      scoreDelta: 0,
      events,
      placement,
      state: {
        ...state,
        board: boardAfterCore,
        hand: state.hand.filter((b) => b.id !== blockId),
        turns: state.turns + 1,
        gameOver: true,
        won: false,
        lastEvents: events,
      },
    };
  }

  const result = variant.onPlacementResolved(boardAfterCore, placement, state.variantState, state.config) || {};
  const mutations = result.mutations || [];
  const scoreDelta = result.scoreDelta || 0;
  const events = result.events || [];
  let variantState = result.variantState || state.variantState;

  const finalBoard = applyMutations(boardAfterCore, mutations);

  let hand = state.hand.filter((b) => b.id !== blockId);
  let nextHand = state.nextHand;
  if (hand.length === 0) {
    hand = nextHand;
    // The preview hand was drawn a turn early, against an older board, so
    // it can be stale by the time it goes live. Re-draw it here if it can't
    // actually be played, so the guarantee holds at the moment it matters.
    if (!variant.getNextHand && !handIsPlayable(finalBoard, hand, rule)) {
      hand = dealHand(variant, state.rng, state.config, variantState, finalBoard).hand;
    }
    const drawn = dealHand(variant, state.rng, state.config, variantState, finalBoard);
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
