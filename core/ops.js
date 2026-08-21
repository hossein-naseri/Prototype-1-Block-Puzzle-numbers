// Operator definitions shared by legality checks, resolution, and the UI.
export const OPS = {
  none: { label: '', legal: () => true, apply: (v) => v },
  plus1: { label: '+1', legal: () => true, apply: (v) => v + 1 },
  minus1: { label: '-1', legal: (v) => v - 1 >= 0, apply: (v) => v - 1 },
  x2: { label: '×2', legal: () => true, apply: (v) => v * 2 },
  div2: { label: '÷2', legal: (v) => v !== 0 && v % 2 === 0, apply: (v) => v / 2 },
};

export function opLegalOnValue(op, value) {
  return OPS[op].legal(value);
}

export function applyOp(op, value) {
  return OPS[op].apply(value);
}
