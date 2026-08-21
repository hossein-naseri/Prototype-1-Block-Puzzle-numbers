import { shapeBounds, SHAPES } from '../core/shapes.js';
import { OPS } from '../core/ops.js';

function shapeById(id) {
  return SHAPES.find((s) => s.id === id);
}

export function blockBounds(block) {
  const rows = block.cells.map((c) => c.dr);
  const cols = block.cells.map((c) => c.dc);
  return { height: Math.max(...rows) + 1, width: Math.max(...cols) + 1 };
}

// Renders a block into a small NxM grid (for hand slots and next-hand preview).
export function renderBlockGlyph(block) {
  const { height, width } = blockBounds(block);
  const el = document.createElement('div');
  el.className = 'block-glyph';
  el.style.gridTemplateRows = `repeat(${height}, 1fr)`;
  el.style.gridTemplateColumns = `repeat(${width}, 1fr)`;

  const grid = new Map();
  for (const cell of block.cells) grid.set(`${cell.dr},${cell.dc}`, cell.op);

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const cellEl = document.createElement('div');
      const op = grid.get(`${r},${c}`);
      cellEl.className = 'block-glyph-cell' + (op !== undefined ? ' filled' : ' empty');
      if (op !== undefined && op !== 'none') {
        cellEl.classList.add(`op-${op}`);
        cellEl.textContent = OPS[op].label;
      }
      el.appendChild(cellEl);
    }
  }
  return el;
}

export function renderBoard(boardEl, board, onCellPointerEnter, onCellPointerUp, onCellClick) {
  boardEl.style.gridTemplateColumns = `repeat(${board.size}, 1fr)`;
  boardEl.style.gridTemplateRows = `repeat(${board.size}, 1fr)`;
  boardEl.innerHTML = '';
  for (let r = 0; r < board.size; r++) {
    for (let c = 0; c < board.size; c++) {
      const cell = board.cells[r * board.size + c];
      const cellEl = document.createElement('div');
      cellEl.className = 'cell';
      cellEl.dataset.r = r;
      cellEl.dataset.c = c;
      if (cell.blocked) {
        cellEl.classList.add('blocked');
      } else {
        cellEl.textContent = String(cell.value);
        if (cell.allowedOps) cellEl.classList.add('locked');
        if (cell.value === 0) cellEl.classList.add('zero');
      }
      cellEl.addEventListener('pointerenter', () => onCellPointerEnter(r, c));
      cellEl.addEventListener('pointerup', () => onCellPointerUp(r, c));
      cellEl.addEventListener('click', () => onCellClick(r, c));
      boardEl.appendChild(cellEl);
    }
  }
}

export function renderTargetGrid(el, targetValues, boardSize, currentBoard) {
  el.style.gridTemplateColumns = `repeat(${boardSize}, 1fr)`;
  el.style.gridTemplateRows = `repeat(${boardSize}, 1fr)`;
  el.innerHTML = '';
  for (let i = 0; i < targetValues.length; i++) {
    const cellEl = document.createElement('div');
    cellEl.className = 'target-cell';
    const value = targetValues[i];
    if (value !== 0) {
      cellEl.textContent = String(value);
      cellEl.classList.add('nonzero');
    }
    if (currentBoard && currentBoard.cells[i].value === value) {
      cellEl.classList.add('matched');
    }
    el.appendChild(cellEl);
  }
}

export function clearPreview(boardEl) {
  boardEl.querySelectorAll('.cell').forEach((el) => {
    el.classList.remove('preview-legal', 'preview-illegal', 'preview-fatal');
  });
}

export function showPreview(boardEl, board, absCells, legal, fatal = false) {
  clearPreview(boardEl);
  const cls = !legal ? 'preview-illegal' : fatal ? 'preview-fatal' : 'preview-legal';
  for (const { r, c } of absCells) {
    if (r < 0 || c < 0 || r >= board.size || c >= board.size) continue;
    const el = boardEl.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
    if (el) el.classList.add(cls);
  }
}

export function shakeCells(boardEl, absCells) {
  for (const { r, c } of absCells) {
    const el = boardEl.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
    if (el) {
      el.classList.add('shake');
      setTimeout(() => el.classList.remove('shake'), 320);
    }
  }
}

export function flashCells(boardEl, cells) {
  for (const { r, c } of cells) {
    const el = boardEl.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
    if (el) {
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 400);
    }
  }
}
