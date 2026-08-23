import { noLegalPlacements } from '../core/legality.js';
import { absoluteCells } from '../core/blocks.js';
import { cellAt } from '../core/board.js';

function lineCells(board, kind, index) {
  return Array.from({ length: board.size }, (_, i) =>
    kind === 'row' ? { r: index, c: i } : { r: i, c: index }
  );
}

// A row or column matches when every tile in it is equal and non-zero. The
// match is attributed to that line only - matching a row ticks the row's
// quota, not the quotas of the columns it crosses.
//
// Matched tiles keep their values. That means a matched line stays matched
// until the player disturbs it, so a line is only reported when it *becomes*
// matched - or re-matches at a different value, which is how you upgrade a
// line to clear a higher quota. Without that transition check a standing
// match would re-score on every placement for the rest of the run.
export const lineLevel = {
  name: 'lineLevel',

  init() {
    return { variantState: { matchedAt: {} } };
  },

  onPlacementResolved(board, placement, variantState) {
    const previous = variantState.matchedAt || {};
    const matchedAt = {};
    const events = [];
    const scoredTiles = [];
    const scoredLines = [];

    for (let index = 0; index < board.size; index++) {
      for (const kind of ['row', 'col']) {
        const cells = lineCells(board, kind, index);
        const values = cells.map(({ r, c }) => cellAt(board, r, c).value);
        const value = values[0];
        if (value === 0 || !values.every((v) => v === value)) continue;

        const key = `${kind}${index}`;
        matchedAt[key] = value;
        if (previous[key] === value) continue; // standing match, already counted

        scoredLines.push({ kind, index, value });
        for (const { r, c } of cells) scoredTiles.push({ r, c, value });
        events.push({ type: 'lineMatch', kind, index, value, cells });
      }
    }

    return {
      mutations: [],
      scoredTiles,
      scoredLines,
      events,
      variantState: { ...variantState, matchedAt },
    };
  },

  isGameOver(board, hand) {
    return noLegalPlacements(board, hand, absoluteCells);
  },

  getHudState() {
    return {};
  },
};
