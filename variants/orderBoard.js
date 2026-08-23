import { noLegalPlacements } from '../core/legality.js';
import { absoluteCells } from '../core/blocks.js';
import { cellAt } from '../core/board.js';

const STONE_OPS = new Set(['minus1', 'div2']);

// A tile landing exactly on the target scores at its own value and resets
// to 0. A tile above the target locks into a stone that only -1 and ÷2 may
// touch, until it comes back down.
export const orderBoard = {
  name: 'orderBoard',

  init(config) {
    return { variantState: { target: config.startTarget, banks: 0 } };
  },

  onPlacementResolved(board, placement, variantState, config) {
    let { target, banks } = variantState;
    const mutations = [];
    const events = [];
    const scoredTiles = [];
    const scoredLines = [];

    for (const changed of placement.changedCells) {
      if (changed.prevValue === changed.value) continue; // 'none' op, nothing moved
      const { r, c, value } = changed;
      const cell = cellAt(board, r, c);

      if (value === target) {
        mutations.push({ r, c, patch: { value: 0, allowedOps: null } });
        scoredTiles.push({ r, c, value });
        // Order Board scores single tiles, not lines, so a bank counts as a
        // match on both the row and the column it sat on.
        scoredLines.push({ kind: 'row', index: r, value });
        scoredLines.push({ kind: 'col', index: c, value });
        banks += 1;
        events.push({ type: 'bank', r, c, target });
        if (banks % config.incrementEvery === 0) {
          target += 1;
          events.push({ type: 'targetUp', target });
        }
      } else if (value > target) {
        mutations.push({ r, c, patch: { allowedOps: new Set(STONE_OPS) } });
        events.push({ type: 'stone', r, c, value });
      } else if (cell.allowedOps) {
        // Was a stone, has been brought back under the target — unlock it.
        mutations.push({ r, c, patch: { allowedOps: null } });
        events.push({ type: 'unstone', r, c, value });
      }
    }

    return { mutations, scoredTiles, scoredLines, events, variantState: { target, banks } };
  },

  isGameOver(board, hand) {
    return noLegalPlacements(board, hand, absoluteCells);
  },

  getHudState(board, variantState) {
    return { Target: variantState.target, Banked: variantState.banks };
  },
};
