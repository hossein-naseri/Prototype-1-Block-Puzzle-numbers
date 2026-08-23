// Operator definitions shared by legality checks, resolution, and the UI.
//
// Tile values may be signed. In the unsigned modes the bottom of the range
// clamps at 0; in signed mode (Fight) a negative value is a *red* tile,
// rendered without a minus sign. Every operator is plain signed arithmetic,
// so the same block does the intuitive thing to either colour: +1 weakens a
// red tile toward 0, -1 strengthens it, x2 doubles its strength.
export const OPS = {
  none: { label: '' },
  plus1: { label: '+1' },
  minus1: { label: '-1' },
  x2: { label: '×2' },
  div2: { label: '÷2' },
};

export const OPERATOR_KEYS = ['none', 'plus1', 'minus1', 'x2', 'div2'];

function rawResult(op, value) {
  switch (op) {
    case 'plus1':
      return value + 1;
    case 'minus1':
      return value - 1;
    case 'x2':
      return value * 2;
    case 'div2':
      // Halves anything, rounding the *magnitude* down: 5 -> 2, and a red
      // 5 (-5) -> red 2 (-2). Truncating toward zero rather than flooring
      // keeps ÷2 a weakening move for both colours; flooring would push a
      // red tile further from zero, which reads backwards.
      return Math.trunc(value / 2);
    default:
      return value;
  }
}

// Nothing about a value makes an operator illegal any more - ÷2 handles odd
// numbers, and both ends of the range are handled by clamping in
// core/resolve.js. Kept as a seam so a future rule has somewhere to live.
export function opLegalOnValue() {
  return true;
}

export function rawOpResult(op, value) {
  return rawResult(op, value);
}

// True when this op would push the tile past the cap, which in the unsigned
// modes costs a strike. The UI warns before the player commits.
export function opWouldStrike(op, value, maxValue) {
  return rawResult(op, value) > maxValue;
}
