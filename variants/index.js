import { sandbox } from './sandbox.js';
import { bloom } from './bloom.js';
import { orderBoard } from './orderBoard.js';
import { lineLevel } from './lineLevel.js';

// Variants register themselves here as they're built (see build order in
// DESIGN.md). Each entry implements the shared interface documented in
// core/engine.js.
export const VARIANTS = {
  sandbox,
  bloom,
  orderBoard,
  lineLevel,
};

export function getVariant(name) {
  return VARIANTS[name] || VARIANTS.sandbox;
}
