import { cloneBoard, cellAt } from './board.js';
import { applyOp } from './ops.js';

// Apply a legal placement's operators to a fresh copy of the board. Returns
// the new board plus the list of cells that actually changed value, which
// variants use to know "what did the player just touch".
export function applyPlacement(board, absCells) {
  const next = cloneBoard(board);
  const changedCells = [];
  for (const { r, c, op } of absCells) {
    const cell = cellAt(next, r, c);
    const prevValue = cell.value;
    cell.value = applyOp(op, prevValue);
    changedCells.push({ r, c, op, prevValue, value: cell.value });
  }
  return { board: next, changedCells };
}
