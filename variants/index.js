import { sandbox } from './sandbox.js';
import { bloom } from './bloom.js';

// Variants register themselves here as they're built (see build order in
// DESIGN.md). Each entry implements the shared interface documented in
// core/engine.js.
export const VARIANTS = {
  sandbox,
  bloom,
};

export function getVariant(name) {
  return VARIANTS[name] || VARIANTS.sandbox;
}
