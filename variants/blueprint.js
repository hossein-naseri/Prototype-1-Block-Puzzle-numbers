import { noLegalPlacements } from '../core/legality.js';
import { absoluteCells } from '../core/blocks.js';
import { createBoard } from '../core/board.js';
import { buildHand } from '../config/levels.js';

// Level-based, authored: no randomness. config.level (set by the UI before
// createGame) supplies the fixed board, target, and hand sequence.
export const blueprint = {
  name: 'blueprint',

  init(config) {
    const { level } = config;
    const board = createBoard(level.boardSize);
    level.startBoard.forEach((value, i) => {
      board.cells[i].value = value;
    });
    return { board, variantState: { handIndex: 0 } };
  },

  getNextHand(rng, config, variantState) {
    const { level } = config;
    const idx = variantState.handIndex;
    const specs = level.handSequence[idx];
    const hand = specs ? buildHand(specs) : [];
    return { hand, variantState: { ...variantState, handIndex: idx + 1 } };
  },

  onPlacementResolved() {
    return { mutations: [], scoreDelta: 0, events: [] };
  },

  checkWin(board, variantState, config) {
    return boardMatchesTarget(board, config.level.targetBoard);
  },

  isGameOver(board, hand, variantState, config) {
    if (hand.length === 0) return true;
    return noLegalPlacements(board, hand, absoluteCells, config.underflowRule);
  },

  getHudState(board, variantState, config) {
    const { level } = config;
    return { Level: level.name, Move: variantState.handIndex, Par: level.par };
  },
};

function boardMatchesTarget(board, targetBoard) {
  for (let i = 0; i < targetBoard.length; i++) {
    if (board.cells[i].value !== targetBoard[i]) return false;
  }
  return true;
}
