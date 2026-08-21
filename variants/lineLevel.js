import { noLegalPlacements } from '../core/legality.js';
import { absoluteCells } from '../core/blocks.js';
import { cellAt } from '../core/board.js';

function lineValues(board, cells) {
  return cells.map(({ r, c }) => cellAt(board, r, c).value);
}

export const lineLevel = {
  name: 'lineLevel',

  onPlacementResolved(board, placement, variantState, config) {
    const mutations = [];
    const events = [];
    let scoreDelta = 0;
    const multiplier = config.lineScoreMultiplier ?? 1;

    const rows = [];
    const cols = [];
    for (let i = 0; i < board.size; i++) {
      rows.push(Array.from({ length: board.size }, (_, c) => ({ r: i, c })));
      cols.push(Array.from({ length: board.size }, (_, r) => ({ r, c: i })));
    }

    for (const line of [...rows, ...cols]) {
      const values = lineValues(board, line);
      const first = values[0];
      if (first === 0 || !values.every((v) => v === first)) continue;
      for (const { r, c } of line) mutations.push({ r, c, patch: { value: 0 } });
      scoreDelta += first * board.size * multiplier;
      events.push({ type: 'lineClear', value: first, cells: line });
    }

    return { mutations, scoreDelta, events };
  },

  isGameOver(board, hand, variantState, config) {
    return noLegalPlacements(board, hand, absoluteCells, config.underflowRule);
  },

  getHudState() {
    return {};
  },
};
