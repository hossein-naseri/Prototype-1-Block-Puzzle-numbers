import { noLegalPlacements } from '../core/legality.js';
import { absoluteCells } from '../core/blocks.js';
import { cellAt } from '../core/board.js';

const STONE_OPS = new Set(['minus1', 'div2']);

export const orderBoard = {
  name: 'orderBoard',

  init(config) {
    return { variantState: { target: config.startTarget, banks: 0 } };
  },

  onPlacementResolved(board, placement, variantState, config) {
    let { target, banks } = variantState;
    const mutations = [];
    const events = [];
    let scoreDelta = 0;

    for (const changed of placement.changedCells) {
      if (changed.prevValue === changed.value) continue; // 'none' op, nothing moved
      const { r, c, value } = changed;
      const cell = cellAt(board, r, c);

      if (value === target) {
        mutations.push({ r, c, patch: { value: 0, allowedOps: null } });
        banks += 1;
        scoreDelta += config.bankScorePerTarget * target;
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

    return { mutations, scoreDelta, events, variantState: { target, banks } };
  },

  isGameOver(board, hand, variantState, config) {
    return noLegalPlacements(board, hand, absoluteCells, config.underflowRule);
  },

  getHudState(board, variantState) {
    return { Target: variantState.target, Banked: variantState.banks };
  },
};
