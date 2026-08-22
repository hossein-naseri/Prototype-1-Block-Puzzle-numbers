import { cloneBoard, cellAt } from './board.js';
import { applyOp } from './ops.js';

// Apply a legal placement's operators to a fresh copy of the board.
//
// Both ends of the number range are enforced here, in core, because they're
// properties of the numbers rather than of any variant's scoring:
//   - below 0 clamps to 0 (handled in applyOp)
//   - above maxValue costs one strike per tile and resets that tile to
//     maxValue, so an over-pumped tile is a penalty rather than a dead end
//
// Returns the new board, the cells that changed, and how many strikes the
// placement cost.
export function applyPlacement(board, absCells, maxValue) {
  const next = cloneBoard(board);
  const changedCells = [];
  let strikesAdded = 0;

  for (const { r, c, op } of absCells) {
    const cell = cellAt(next, r, c);
    const prevValue = cell.value;
    let value = applyOp(op, prevValue);

    let struck = false;
    if (value > maxValue) {
      value = maxValue;
      strikesAdded += 1;
      struck = true;
    }

    cell.value = value;
    changedCells.push({ r, c, op, prevValue, value, struck });
  }

  return { board: next, changedCells, strikesAdded };
}
