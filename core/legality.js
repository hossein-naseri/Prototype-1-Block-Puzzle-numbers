import { inBounds, cellAt } from './board.js';
import { opLegalOnValue } from './ops.js';

// A placement is legal only if every one of its cells is legal: in bounds,
// not blocked, not restricted away from this op, and the op itself is legal
// on that cell's current value under the active underflow rule. One illegal
// cell fails the whole placement.
export function canPlace(board, absCells, rule = 'strict') {
  for (const { r, c, op } of absCells) {
    if (!inBounds(board.size, r, c)) return false;
    const cell = cellAt(board, r, c);
    if (cell.blocked) return false;
    if (cell.allowedOps && op !== 'none' && !cell.allowedOps.has(op)) return false;
    if (!opLegalOnValue(op, cell.value, rule)) return false;
  }
  return true;
}

export function anyPlacementForBlock(board, block, absoluteCellsFn, rule = 'strict') {
  for (let r = 0; r < board.size; r++) {
    for (let c = 0; c < board.size; c++) {
      const abs = absoluteCellsFn(block, r, c);
      if (canPlace(board, abs, rule)) return { r, c };
    }
  }
  return null;
}

export function noLegalPlacements(board, hand, absoluteCellsFn, rule = 'strict') {
  return hand.every((block) => anyPlacementForBlock(board, block, absoluteCellsFn, rule) === null);
}
