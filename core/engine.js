import { createBoard, createStartingBoard, applyMutations } from './board.js';
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
//   init(config, rng, board) -> { board?, variantState }            (optional)
//   getNextHand(rng, config, variantState) -> { hand, variantState } (optional)
//   onPlacementResolved(board, placement, variantState, config)
//       -> { mutations, scoredTiles, scoredLines, events, variantState? }
//          scoredTiles: [{ r, c, value }] - tiles whose number was turned
//            into score this placement. The engine squares each value into
//            the running score.
//          scoredLines: [{ kind: 'row'|'col', index, value }] - scoring
//            events attributed to a whole line. The engine ticks that
//            line's quota if value >= the quota. Each variant decides what
//            counts: Line Level reports the line it cleared; Order Board
//            reports both the row and the column a banked tile sat on,
//            since it scores single tiles rather than lines.
//   onTurnEnd(board, variantState, config, rng)                     (optional)
//       -> { mutations, events, variantState? }
//       Fires once the last block of a hand is placed, before the next hand
//       is dealt. Fight mode uses it for the phase where queued red threats
//       land and the board re-resolves.
//   getOutcome(board, variantState, config)                          (optional)
//       -> { won?, lost?, reason? } - a variant-owned win/lose condition,
//       for modes that don't use the row/column quotas.
//   usesLineQuotas: false                                            (optional)
//       Opts out of the quota system entirely (rolling, checking, winning).
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

// Squared tile value is the score formula: a scored 4 is worth 16.
export function tileScore(value) {
  return value * value;
}

// Every row and every column is given a quota in 1..maxValue. Bounding by
// maxValue (rather than a hard 9) keeps quotas achievable if the tile cap
// is lowered - a quota the player can never reach would make the level
// unwinnable by construction.
export function rollQuotas(rng, boardSize, maxValue) {
  const ceiling = Math.max(1, maxValue);
  return Array.from({ length: boardSize }, () => 1 + rng.int(ceiling));
}

function allChecked(rowChecked, colChecked) {
  return [...rowChecked, ...colChecked].every(Boolean);
}

export function createGame(variant, config, seed) {
  const rng = new SeededRng(seed);
  // The starting board is built up front so init() can inspect it - Fight
  // needs it to roll the opening turn's threats.
  let board = createStartingBoard(config, rng);
  let variantState = {};

  if (variant.init) {
    const initResult = variant.init(config, rng, board) || {};
    if (initResult.board) board = initResult.board;
    if (initResult.variantState) variantState = initResult.variantState;
  }

  // Rolled before the hands are dealt so the whole setup is reproducible
  // from the seed. Variants that own their own win condition skip them.
  const usesQuotas = variant.usesLineQuotas !== false;
  const rowQuotas = usesQuotas ? rollQuotas(rng, board.size, config.maxValue) : [];
  const colQuotas = usesQuotas ? rollQuotas(rng, board.size, config.maxValue) : [];

  const first = dealHand(variant, rng, config, variantState, board);
  variantState = first.variantState;
  const hand = first.hand;
  const second = dealHand(variant, rng, config, variantState, board);
  variantState = second.variantState;
  const nextHand = second.hand;

  // A starting board can already be decided - e.g. a Fight run whose start
  // value hands one side the whole board - so the variant's own outcome is
  // checked here too, not just after the first placement.
  const initialOutcome = variant.getOutcome ? variant.getOutcome(board, variantState, config) || {} : {};
  const stuck = variant.isGameOver ? variant.isGameOver(board, hand, variantState, config) : false;

  return {
    variantName: variant.name,
    config,
    seed,
    rng,
    board,
    hand,
    nextHand,
    variantState,
    rowQuotas,
    colQuotas,
    rowChecked: new Array(rowQuotas.length).fill(false),
    colChecked: new Array(colQuotas.length).fill(false),
    strikes: 0,
    score: 0,
    turns: 0,
    gameOver: stuck || initialOutcome.won === true || initialOutcome.lost === true,
    won: initialOutcome.won === true,
    outcomeReason: initialOutcome.reason || null,
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
  if (legal && !state.config.signedValues) {
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
    state.config
  );
  const placement = { block, absCells, changedCells };

  const result = variant.onPlacementResolved(boardAfterCore, placement, state.variantState, state.config) || {};
  const mutations = result.mutations || [];
  const scoredTiles = result.scoredTiles || [];
  const scoredLines = result.scoredLines || [];
  const events = [...(result.events || [])];
  let variantState = result.variantState || state.variantState;

  if (strikesAdded > 0) {
    events.push({ type: 'strike', count: strikesAdded, cells: changedCells.filter((c) => c.struck) });
  }

  const finalBoard = applyMutations(boardAfterCore, mutations);

  let scoreDelta = 0;
  for (const { value } of scoredTiles) scoreDelta += tileScore(value);

  // A line's quota is ticked by any scoring event on it that reaches the
  // stated value. Checks are permanent once earned.
  const rowChecked = [...state.rowChecked];
  const colChecked = [...state.colChecked];
  const newlyChecked = [];
  for (const { kind, index, value } of scoredLines) {
    const checked = kind === 'row' ? rowChecked : colChecked;
    const quotas = kind === 'row' ? state.rowQuotas : state.colQuotas;
    if (index < 0 || index >= checked.length) continue;
    if (checked[index] || value < quotas[index]) continue;
    checked[index] = true;
    newlyChecked.push({ kind, index, value, quota: quotas[index] });
  }
  if (newlyChecked.length > 0) events.push({ type: 'quotaMet', lines: newlyChecked });

  const strikes = state.strikes + strikesAdded;

  let hand = state.hand.filter((b) => b.id !== blockId);
  let nextHand = state.nextHand;
  let boardAfterTurn = finalBoard;

  if (hand.length === 0) {
    // The hand is spent, so the turn is over. Give the variant its end-of-
    // turn phase (Fight lands its queued red threats here) *before* the next
    // hand is dealt, so the new hand is judged against the resolved board.
    if (variant.onTurnEnd) {
      const turnResult = variant.onTurnEnd(boardAfterTurn, variantState, state.config, state.rng) || {};
      boardAfterTurn = applyMutations(boardAfterTurn, turnResult.mutations || []);
      events.push(...(turnResult.events || []));
      if (turnResult.variantState) variantState = turnResult.variantState;
    }

    hand = nextHand;
    if (!variant.getNextHand && !handIsPlayable(boardAfterTurn, hand)) {
      hand = dealHand(variant, state.rng, state.config, variantState, boardAfterTurn).hand;
    }
    const drawn = dealHand(variant, state.rng, state.config, variantState, boardAfterTurn);
    nextHand = drawn.hand;
    variantState = drawn.variantState;
  }

  // A placement can both satisfy the win and take the final strike. The
  // strike is applied during operator resolution, before the variant gets a
  // chance to score anything, so it lands first and the loss takes
  // precedence over the win.
  const lostToStrikes = !state.config.signedValues && strikes >= state.config.maxStrikes;
  const outcome = variant.getOutcome
    ? variant.getOutcome(boardAfterTurn, variantState, state.config) || {}
    : {};
  const quotaWin = variant.usesLineQuotas !== false && allChecked(rowChecked, colChecked);
  const won = !lostToStrikes && !outcome.lost && (quotaWin || outcome.won === true);
  const stuck = variant.isGameOver
    ? variant.isGameOver(boardAfterTurn, hand, variantState, state.config)
    : false;
  const gameOver = won || lostToStrikes || outcome.lost === true || stuck;

  if (lostToStrikes) events.push({ type: 'strikeOut', strikes });
  if (outcome.lost === true) events.push({ type: 'defeat', reason: outcome.reason });
  if (won) events.push({ type: 'win', reason: outcome.reason });

  const nextState = {
    ...state,
    board: boardAfterTurn,
    hand,
    nextHand,
    variantState,
    outcomeReason: outcome.reason || null,
    rowChecked,
    colChecked,
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
