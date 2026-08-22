import { orderBoard } from './orderBoard.js';
import { lineLevel } from './lineLevel.js';

// Each entry implements the shared interface documented in core/engine.js.
// Variants decide *when* a tile's number turns into score; the engine owns
// everything else (number rules, column bars, win/lose).
export const VARIANTS = {
  lineLevel,
  orderBoard,
};

export function getVariant(name) {
  return VARIANTS[name] || VARIANTS.lineLevel;
}
