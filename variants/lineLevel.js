import { noLegalPlacements } from '../core/legality.js';
import { absoluteCells } from '../core/blocks.js';
import { cellAt } from '../core/board.js';

// A row or column scores when every tile in it is equal and non-zero. Each
// tile in that line is reported as scored at its own value, so a cleared
// line of 4s sends 4^2 = 16 into each of the columns it spans.
export const lineLevel = {
  name: 'lineLevel',

  onPlacementResolved(board) {
    const mutations = [];
    const events = [];
    const scoredTiles = [];

    const lines = [];
    for (let i = 0; i < board.size; i++) {
      lines.push(Array.from({ length: board.size }, (_, c) => ({ r: i, c })));
      lines.push(Array.from({ length: board.size }, (_, r) => ({ r, c: i })));
    }

    // A tile at a row/column intersection can be part of two clearing lines
    // at once. It only scores once, and only zeroes once.
    const cleared = new Set();

    for (const line of lines) {
      const values = line.map(({ r, c }) => cellAt(board, r, c).value);
      const first = values[0];
      if (first === 0 || !values.every((v) => v === first)) continue;

      for (const { r, c } of line) {
        const key = `${r},${c}`;
        if (cleared.has(key)) continue;
        cleared.add(key);
        mutations.push({ r, c, patch: { value: 0 } });
        scoredTiles.push({ r, c, value: first });
      }
      events.push({ type: 'lineClear', value: first, cells: line });
    }

    return { mutations, scoredTiles, events };
  },

  isGameOver(board, hand) {
    return noLegalPlacements(board, hand, absoluteCells);
  },

  getHudState() {
    return {};
  },
};
