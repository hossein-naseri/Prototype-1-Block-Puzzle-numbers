import { cloneBoard, cellAt } from './board.js';
import { rawOpResult } from './ops.js';

// Confine a raw operator result to the mode's legal range.
//
// Unsigned modes (Line Level, Order Board): the bottom clamps at 0, and
// going above maxValue costs one strike per tile and resets it to the cap.
//
// Signed mode (Fight): a tile may be negative - that's a red tile - so only
// the magnitude is capped, at maxValue in either direction. No strikes: that
// mode has its own win/lose condition and never mentions them.
export function confine(raw, config) {
  const maxValue = config.maxValue;
  if (config.signedValues) {
    return { value: Math.max(-maxValue, Math.min(maxValue, raw)), struck: false };
  }
  if (raw < 0) return { value: 0, struck: false };
  if (raw > maxValue) return { value: maxValue, struck: true };
  return { value: raw, struck: false };
}

// Apply a legal placement's operators to a fresh copy of the board. Returns
// the new board, the cells that changed, and how many strikes it cost.
export function applyPlacement(board, absCells, config) {
  const next = cloneBoard(board);
  const changedCells = [];
  let strikesAdded = 0;

  for (const { r, c, op } of absCells) {
    const cell = cellAt(next, r, c);
    const prevValue = cell.value;
    const { value, struck } = confine(rawOpResult(op, prevValue), config);
    if (struck) strikesAdded += 1;
    cell.value = value;
    changedCells.push({ r, c, op, prevValue, value, struck });
  }

  return { board: next, changedCells, strikesAdded };
}
