// Operator definitions shared by legality checks, resolution, and the UI.
//
// What happens at the *bottom* of the number range is a swappable rule, so
// the prototype can test several answers to "should -1 be blocked, fatal,
// or just floor at zero?". The rule is a core numeric concern (not a
// variant concern), so it lives here and is threaded through legality and
// resolution rather than being reimplemented per variant.
export const UNDERFLOW_RULES = ['strict', 'instaLoss', 'clamp', 'deadAtZero'];

export const UNDERFLOW_LABELS = {
  strict: 'a) Strict — below 0 impossible',
  instaLoss: 'b) Below 0 allowed — insta-loss',
  clamp: 'c) Clamp at 0 — allowed, floors',
  deadAtZero: 'd) Clamp at 0 + reaching 0 kills tile',
};

export const UNDERFLOW_HELP = {
  strict:
    'A -1 that would take a tile below 0 is an illegal placement, as is ÷2 on 0. Dead hands are re-rolled so a deal always has at least one legal move.',
  instaLoss:
    'A -1 may be placed on a 0. Doing it drives the tile below 0 and immediately ends the run.',
  clamp:
    'A -1 may be placed on a 0. The placement is legal and the tile simply stays at 0.',
  deadAtZero:
    'As (c), but any tile driven from a positive value down to exactly 0 becomes a permanently dead cell — the same fate as exceeding the max value in Pressure Cooker.',
};

export const OPS = {
  none: { label: '' },
  plus1: { label: '+1' },
  minus1: { label: '-1' },
  x2: { label: '×2' },
  div2: { label: '÷2' },
};

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

export function opLegalOnValue(op, value, rule = 'strict') {
  if (op === 'none' || op === 'plus1' || op === 'x2') return true;

  if (op === 'div2') {
    // A fractional tile isn't representable under any rule, so the even
    // requirement always holds. Only the separate "÷2 may not touch 0"
    // restriction is relaxed by the permissive rules, where 0 ÷ 2 = 0 is
    // a harmless legal no-op. Without this, ÷2 blocks would still be dead
    // on an all-zero board and (b)/(c) wouldn't actually fix the opening.
    if (value % 2 !== 0) return false;
    return rule === 'strict' ? value !== 0 : true;
  }

  // minus1
  if (rule === 'strict') return value - 1 >= 0;
  return true;
}

export function applyOp(op, value, rule = 'strict') {
  const raw = rawResult(op, value);
  // Only 'instaLoss' lets a tile actually hold a negative value - it needs
  // to, so the engine can see the underflow and end the run. Every other
  // rule floors at 0.
  if (raw < 0 && rule !== 'instaLoss') return 0;
  return raw;
}

export function isFatalValue(value, rule) {
  return rule === 'instaLoss' && value < 0;
}

// "Reaching 0" means arriving at 0 from a positive value. A tile that was
// already 0 (or a x2/÷2 no-op on 0) is untouched, which is what keeps rule
// (d) from killing an entire freshly-created all-zero board.
export function diesAtZero(prevValue, newValue, rule) {
  return rule === 'deadAtZero' && prevValue > 0 && newValue === 0;
}
