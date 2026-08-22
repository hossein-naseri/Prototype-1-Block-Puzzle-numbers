import { OPS } from '../core/ops.js';

export function blockBounds(block) {
  const rows = block.cells.map((c) => c.dr);
  const cols = block.cells.map((c) => c.dc);
  return { height: Math.max(...rows) + 1, width: Math.max(...cols) + 1 };
}

// Renders a block into a small NxM grid (for hand slots and next-hand
// preview). Glyphs are laid out on a fixed 3x3 so a 1-tile block doesn't
// balloon to fill the whole slot.
export function renderBlockGlyph(block) {
  const { height, width } = blockBounds(block);
  const el = document.createElement('div');
  el.className = 'block-glyph';
  el.style.gridTemplateRows = `repeat(${height}, 1fr)`;
  el.style.gridTemplateColumns = `repeat(${width}, 1fr)`;
  el.style.width = `${(width / 3) * 100}%`;
  el.style.height = `${(height / 3) * 100}%`;

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

// One vertical bar per column, sitting directly above it and filling from
// the bottom as that column's tiles are scored.
export function renderScoreBars(barsEl, bars, capacity, boardSize) {
  barsEl.style.gridTemplateColumns = `repeat(${boardSize}, 1fr)`;
  barsEl.innerHTML = '';
  for (let c = 0; c < boardSize; c++) {
    const fill = bars[c] || 0;
    const pct = Math.min(100, (fill / capacity) * 100);

    const track = document.createElement('div');
    track.className = 'bar-track';
    track.dataset.c = c;
    if (fill >= capacity) track.classList.add('full');

    const fillEl = document.createElement('div');
    fillEl.className = 'bar-fill';
    fillEl.style.height = `${pct}%`;

    const labelEl = document.createElement('div');
    labelEl.className = 'bar-label';
    labelEl.textContent = `${Math.min(fill, capacity)}`;

    track.append(fillEl, labelEl);
    barsEl.appendChild(track);
  }
}

export function pulseBars(barsEl, columns) {
  for (const c of columns) {
    const el = barsEl.querySelector(`.bar-track[data-c="${c}"]`);
    if (el) {
      el.classList.add('bar-pop');
      setTimeout(() => el.classList.remove('bar-pop'), 400);
    }
  }
}

export function clearPreview(boardEl) {
  boardEl.querySelectorAll('.cell').forEach((el) => {
    el.classList.remove('preview-legal', 'preview-illegal', 'preview-strike');
  });
}

export function showPreview(boardEl, board, absCells, legal, strikes = 0) {
  clearPreview(boardEl);
  const cls = !legal ? 'preview-illegal' : strikes > 0 ? 'preview-strike' : 'preview-legal';
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

export function flashCells(boardEl, cells, cls = 'flash') {
  for (const { r, c } of cells) {
    const el = boardEl.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
    if (el) {
      el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), 400);
    }
  }
}
