import { noLegalPlacements } from '../core/legality.js';
import { absoluteCells } from '../core/blocks.js';
import { forEachCell } from '../core/board.js';

function deadCellMutations(board, changedCells, cap) {
  const mutations = [];
  const events = [];
  for (const { r, c, value } of changedCells) {
    if (value > cap) {
      mutations.push({ r, c, patch: { blocked: true } });
      events.push({ type: 'deadCell', r, c, value });
    }
  }
  return { mutations, events };
}

// Standalone: score = turns survived. Tiles pushed above the cap become
// permanently unusable, shrinking the effective board over time.
export const pressure = {
  name: 'pressure',

  onPlacementResolved(board, placement, variantState, config) {
    const { mutations, events } = deadCellMutations(board, placement.changedCells, config.cap);
    return { mutations, scoreDelta: 1, events };
  },

  isGameOver(board, hand) {
    return noLegalPlacements(board, hand, absoluteCells);
  },

  getHudState(board, variantState, config) {
    let dead = 0;
    forEachCell(board, (r, c, cell) => {
      if (cell.blocked) dead += 1;
    });
    return { Cap: config.cap, Dead: dead };
  },
};

// Composable form: layers the cap/dead-cell rule on top of another
// variant's scoring and mutation logic, per the brief's "build it as a
// modifier if that's clean" option. Not wired into the variant selector by
// default (v1 ships the five variants standalone) but available for a
// later playtest that wants e.g. Bloom-under-pressure.
export function withPressure(baseVariant, cap) {
  return {
    name: `${baseVariant.name}+pressure`,
    init: baseVariant.init,
    getNextHand: baseVariant.getNextHand,
    onPlacementResolved(board, placement, variantState, config) {
      const base = baseVariant.onPlacementResolved(board, placement, variantState, config) || {};
      const { mutations: deadMutations, events: deadEvents } = deadCellMutations(
        board,
        placement.changedCells,
        cap
      );
      return {
        mutations: [...(base.mutations || []), ...deadMutations],
        scoreDelta: base.scoreDelta || 0,
        events: [...(base.events || []), ...deadEvents],
        variantState: base.variantState,
      };
    },
    isGameOver(board, hand, variantState, config) {
      return baseVariant.isGameOver
        ? baseVariant.isGameOver(board, hand, variantState, config)
        : noLegalPlacements(board, hand, absoluteCells);
    },
    getHudState(board, variantState, config) {
      const base = baseVariant.getHudState ? baseVariant.getHudState(board, variantState, config) : {};
      let dead = 0;
      forEachCell(board, (r, c, cell) => {
        if (cell.blocked) dead += 1;
      });
      return { ...base, Cap: cap, Dead: dead };
    },
    checkWin: baseVariant.checkWin,
  };
}
