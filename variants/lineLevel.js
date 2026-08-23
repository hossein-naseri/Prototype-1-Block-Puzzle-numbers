import { noLegalPlacements } from '../core/legality.js';
import { absoluteCells } from '../core/blocks.js';
import { cellAt } from '../core/board.js';

// A row or column scores when every tile in it is equal and non-zero. The
// match is attributed to the line it was made on - clearing a row ticks
// that row's quota, not the quotas of the columns it crosses.
export const lineLevel = {
  name: 'lineLevel',

  onPlacementResolved(board) {
    const mutations = [];
    const events = [];
    const scoredTiles = [];
    const scoredLines = [];

    const lines = [];
    for (let i = 0; i < board.size; i++) {
      lines.push({ kind: 'row', index: i, cells: Array.from({ length: board.size }, (_, c) => ({ r: i, c })) });
      lines.push({ kind: 'col', index: i, cells: Array.from({ length: board.size }, (_, r) => ({ r, c: i })) });
    }

    // A tile at a row/column intersection can be part of two clearing lines
    // at once. It only scores once, and only zeroes once - but both lines
    // still count as matched.
    const cleared = new Set();

    for (const { kind, index, cells } of lines) {
      const values = cells.map(({ r, c }) => cellAt(board, r, c).value);
      const first = values[0];
      if (first === 0 || !values.every((v) => v === first)) continue;

      for (const { r, c } of cells) {
        const key = `${r},${c}`;
        if (cleared.has(key)) continue;
        cleared.add(key);
        mutations.push({ r, c, patch: { value: 0 } });
        scoredTiles.push({ r, c, value: first });
      }
      scoredLines.push({ kind, index, value: first });
      events.push({ type: 'lineClear', kind, index, value: first, cells });
    }

    return { mutations, scoredTiles, scoredLines, events };
  },

  isGameOver(board, hand) {
    return noLegalPlacements(board, hand, absoluteCells);
  },

  getHudState() {
    return {};
  },
};
