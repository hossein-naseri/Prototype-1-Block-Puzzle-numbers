import { noLegalPlacements } from '../core/legality.js';
import { absoluteCells } from '../core/blocks.js';

// No goal. Just placement, so the base mechanic can be felt in isolation.
export const sandbox = {
  name: 'sandbox',

  onPlacementResolved() {
    return { mutations: [], scoreDelta: 0, events: [] };
  },

  isGameOver(board, hand) {
    return noLegalPlacements(board, hand, absoluteCells);
  },

  getHudState() {
    return {};
  },
};
