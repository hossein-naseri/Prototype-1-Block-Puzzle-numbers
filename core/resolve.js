import { cloneBoard, cellAt } from './board.js';
import { applyOp, diesAtZero } from './ops.js';

// Apply a legal placement's operators to a fresh copy of the board. Returns
// the new board plus the list of cells that actually changed value, which
// variants use to know "what did the player just touch".
//
// Under the 'deadAtZero' rule a tile driven from positive down to exactly 0
// is killed here, in core, because it's a property of the number range
// rather than of any variant's scoring. Note this only applies to tiles the
// *block* touched - a variant that zeroes a tile itself (a Bloom collapse,
// a Line Level clear) is not "reaching 0" in this sense and never kills.
export function applyPlacement(board, absCells, rule = 'strict') {
  const next = cloneBoard(board);
  const changedCells = [];
  for (const { r, c, op } of absCells) {
    const cell = cellAt(next, r, c);
    const prevValue = cell.value;
    cell.value = applyOp(op, prevValue, rule);
    if (diesAtZero(prevValue, cell.value, rule)) cell.blocked = true;
    changedCells.push({ r, c, op, prevValue, value: cell.value });
  }
  return { board: next, changedCells };
}
