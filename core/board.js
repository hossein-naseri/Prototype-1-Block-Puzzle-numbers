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
