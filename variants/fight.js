import { forEachCell, inBounds, cellAt } from '../core/board.js';
import { confine } from '../core/resolve.js';

// Fight Mode: a two-sided territory fight over one board.
//
// Tile values are signed. A positive tile is GREEN (the player's), a
// negative tile is RED (the opponent's), and 0 is neutral. Red values are
// rendered as their magnitude in red, without a minus sign, so "red 2" is
// the value -2. All arithmetic is ordinary signed arithmetic, which makes
// the operators read naturally from either side: +1 pushes a tile toward
// green, -1 toward red, x2 doubles whoever holds it.

const NEIGHBOURS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function key(r, c) {
  return `${r},${c}`;
}

// Roll this turn's threats: `threatsPerTurn` distinct tiles, each carrying
// 1..threatMaxStacks red triangles. Each triangle is one point of red
// pressure that lands at the end of the turn.
export function rollThreats(rng, board, config) {
  const total = board.size * board.size;
  const wanted = Math.min(config.threatsPerTurn, total);
  const chosen = new Set();
  const threats = {};

  // Sample without replacement, bounded so a tiny board can't spin.
  for (let attempt = 0; attempt < total * 10 && chosen.size < wanted; attempt++) {
    const index = rng.int(total);
    if (chosen.has(index)) continue;
    chosen.add(index);
    const r = Math.floor(index / board.size);
    const c = index % board.size;
    threats[key(r, c)] = 1 + rng.int(Math.max(1, config.threatMaxStacks));
  }
  return threats;
}

// A tile flips when at least 2 of its 4 orthogonal neighbours are the
// opposing colour with magnitude >= its own.
//
// The brief spells this out as "one cell on either side, or one horizontal
// and one vertical" — between them those cover all 6 pairs drawn from the 4
// orthogonal neighbours, so the rule is simply "any two of them". That's
// also what lets corner tiles (which only have two neighbours, one
// horizontal and one vertical) be converted at all.
//
// Flips are evaluated against a snapshot and applied together, so the
// outcome doesn't depend on scan order and neither colour gets to move
// first. One pass per resolution point — a flip that newly enables another
// waits for the next placement rather than cascading.
export function resolveConversions(board) {
  const flips = [];

  forEachCell(board, (r, c, cell) => {
    const value = cell.value;
    if (value === 0) return;
    const magnitude = Math.abs(value);
    const sign = Math.sign(value);

    let surrounders = 0;
    for (const [dr, dc] of NEIGHBOURS) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(board.size, nr, nc)) continue;
      const other = cellAt(board, nr, nc).value;
      if (Math.sign(other) === -sign && Math.abs(other) >= magnitude) surrounders += 1;
    }

    if (surrounders >= 2) {
      flips.push({ r, c, from: value, to: -value });
    }
  });

  return flips;
}

export function countControl(board) {
  let green = 0;
  let red = 0;
  forEachCell(board, (r, c, cell) => {
    if (cell.value > 0) green += 1;
    else if (cell.value < 0) red += 1;
  });
  return { green, red, total: board.size * board.size };
}

// Tiles needed to win: strictly more than the configured share. On a 3x3
// that's 9 * 0.7 = 6.3, so 7 tiles.
export function controlTarget(total, share) {
  return Math.floor(total * share) + 1;
}

function conversionResult(board) {
  const flips = resolveConversions(board);
  return {
    mutations: flips.map(({ r, c, to }) => ({ r, c, patch: { value: to } })),
    events: flips.length > 0 ? [{ type: 'convert', flips }] : [],
  };
}

export const fight = {
  name: 'fight',

  // Fight owns its win condition, so the row/column quota system is off.
  usesLineQuotas: false,

  init(config, rng, board) {
    return { variantState: { threats: rollThreats(rng, board, config), round: 1 } };
  },

  getHudState(board, variantState, config) {
    const { green, red, total } = countControl(board);
    return {
      Round: variantState.round,
      Green: green,
      Red: red,
      Need: controlTarget(total, config.controlThreshold),
    };
  },

  onPlacementResolved(board) {
    const { mutations, events } = conversionResult(board);
    return { mutations, scoredTiles: [], scoredLines: [], events };
  },

  onTurnEnd(board, variantState, config, rng) {
    const mutations = [];
    const events = [];

    // 1. The queued red pressure lands.
    const landed = [];
    for (const [cellKey, stacks] of Object.entries(variantState.threats || {})) {
      const [r, c] = cellKey.split(',').map(Number);
      if (!inBounds(board.size, r, c)) continue;
      const prev = cellAt(board, r, c).value;
      const { value } = confine(prev - stacks, config);
      mutations.push({ r, c, patch: { value } });
      landed.push({ r, c, stacks, from: prev, to: value });
    }
    if (landed.length > 0) events.push({ type: 'threatLanded', cells: landed });

    // 2. Re-resolve conversions against the post-threat board.
    const afterThreats = {
      size: board.size,
      cells: board.cells.map((cell) => ({ ...cell })),
    };
    for (const m of mutations) afterThreats.cells[m.r * board.size + m.c].value = m.patch.value;
    const converted = conversionResult(afterThreats);
    mutations.push(...converted.mutations);
    events.push(...converted.events);

    // 3. Queue next turn's threats, against the fully resolved board.
    const resolved = {
      size: board.size,
      cells: afterThreats.cells.map((cell) => ({ ...cell })),
    };
    for (const m of converted.mutations) resolved.cells[m.r * board.size + m.c].value = m.patch.value;
    const threats = rollThreats(rng, resolved, config);

    return {
      mutations,
      events,
      variantState: { ...variantState, threats, round: variantState.round + 1 },
    };
  },

  getOutcome(board, variantState, config) {
    const { green, red, total } = countControl(board);
    const target = controlTarget(total, config.controlThreshold);
    if (green >= target) return { won: true, reason: `green holds ${green}/${total}` };
    if (red >= target) return { lost: true, reason: `red holds ${red}/${total}` };
    return {};
  },

  // Every placement is legal in this mode (÷2 handles any value, and the
  // signed range never blocks an operator), so a dead end isn't reachable.
  isGameOver() {
    return false;
  },
};
