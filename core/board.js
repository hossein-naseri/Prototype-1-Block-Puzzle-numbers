// Plain-object board state. No variant knowledge lives here.
// A cell is { value, blocked, allowedOps }.
//   blocked: true    -> permanently unusable (dead cell), fails all legality.
//   allowedOps: null -> any op legal (subject to the normal numeric rules).
//   allowedOps: Set   -> only ops in the set (plus 'none', which never
//                        mutates a value) may be applied to this cell.

export function idx(size, r, c) {
  return r * size + c;
}

export function inBounds(size, r, c) {
  return r >= 0 && c >= 0 && r < size && c < size;
}

export function createBoard(size) {
  const cells = new Array(size * size);
  for (let i = 0; i < cells.length; i++) {
    cells[i] = { value: 0, blocked: false, allowedOps: null };
  }
  return { size, cells };
}

// Build the board a run starts from. Per-tile starting value: 'random'
// picks strictly between 0 and maxValue, excluding both ends, so no tile
// starts already at zero or already capped.
export function createStartingBoard(config, rng) {
  const board = createBoard(config.boardSize);
  const startValue = config.startValue ?? 0;
  if (startValue === 0) return board;

  const maxValue = config.maxValue ?? 9;
  for (const cell of board.cells) {
    if (startValue === 'random') {
      const span = maxValue - 1; // candidates are 1 .. maxValue-1
      cell.value = span >= 1 ? 1 + rng.int(span) : 0;
    } else {
      cell.value = Math.min(startValue, maxValue);
    }
  }
  return board;
}

export function cellAt(board, r, c) {
  return board.cells[idx(board.size, r, c)];
}

export function cloneBoard(board) {
  return {
    size: board.size,
    cells: board.cells.map((cell) => ({
      value: cell.value,
      blocked: cell.blocked,
      allowedOps: cell.allowedOps ? new Set(cell.allowedOps) : null,
    })),
  };
}

// Apply a list of { r, c, patch } partial cell updates to a *new* board.
export function applyMutations(board, mutations) {
  if (!mutations || mutations.length === 0) return board;
  const next = cloneBoard(board);
  for (const m of mutations) {
    const cell = cellAt(next, m.r, m.c);
    Object.assign(cell, m.patch);
  }
  return next;
}

export function forEachCell(board, fn) {
  for (let r = 0; r < board.size; r++) {
    for (let c = 0; c < board.size; c++) {
      fn(r, c, cellAt(board, r, c));
    }
  }
}

export function boardsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (let i = 0; i < a.cells.length; i++) {
    if (a.cells[i].value !== b.cells[i].value) return false;
  }
  return true;
}
