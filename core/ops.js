// Operator definitions shared by legality checks, resolution, and the UI.
//
// The bottom of the number range always clamps: a -1 that would take a tile
// below 0 is a legal placement that simply floors the tile at 0. The top of
// the range is handled in resolve.js, where exceeding maxValue costs a
// strike and resets the tile to maxValue.
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
      return value / 2;
    default:
      return value;
  }
}

export function opLegalOnValue(op, value) {
  // A fractional tile isn't representable, so ÷2 still needs an even value.
  // Zero is fine (0 ÷ 2 = 0, a harmless no-op) - blocking it would leave ÷2
  // blocks unplayable on an empty board.
  if (op === 'div2') return value % 2 === 0;
  return true;
}

export function applyOp(op, value) {
  return Math.max(0, rawResult(op, value));
}

// True when this op on this value would push the tile past the cap, which
// costs the player a strike. Legal, but the UI warns before committing.
export function opWouldStrike(op, value, maxValue) {
  return rawResult(op, value) > maxValue;
}
