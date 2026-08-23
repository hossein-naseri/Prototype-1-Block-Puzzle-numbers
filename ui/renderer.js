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

// `threats` is an optional { "r,c": stacks } map (Fight mode). Each stack
// draws one red triangle in the tile's top-left corner, flagging red
// pressure that lands at the end of the turn.
export function renderBoard(boardEl, board, handlers, threats = null) {
  const { onCellPointerEnter, onCellPointerUp, onCellClick } = handlers;
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
        // A negative value is a red tile, shown as its magnitude with no
        // minus sign; positive is green; 0 is neutral.
        cellEl.textContent = String(Math.abs(cell.value));
        if (cell.allowedOps) cellEl.classList.add('locked');
        if (cell.value === 0) cellEl.classList.add('zero');
        else if (cell.value < 0) cellEl.classList.add('red-tile');
        else cellEl.classList.add('green-tile');

        const stacks = threats ? threats[`${r},${c}`] : 0;
        if (stacks > 0) {
          const flagEl = document.createElement('div');
          flagEl.className = 'threat-flags';
          flagEl.textContent = '▲'.repeat(stacks);
          flagEl.title = `${stacks} red pressure lands here at end of turn`;
          cellEl.appendChild(flagEl);
        }
      }
      cellEl.addEventListener('pointerenter', () => onCellPointerEnter(r, c));
      cellEl.addEventListener('pointerup', () => onCellPointerUp(r, c));
      cellEl.addEventListener('click', () => onCellClick(r, c));
      boardEl.appendChild(cellEl);
    }
  }
}

// Quota chips: one down the left of the rows, one under each column. Each
// shows the value a match on that line has to reach; once met it flips to a
// checkmark and stays that way.
export function renderQuotas(el, quotas, checked, kind) {
  const vertical = kind === 'row';
  el.style[vertical ? 'gridTemplateRows' : 'gridTemplateColumns'] = `repeat(${quotas.length}, 1fr)`;
  el.innerHTML = '';
  quotas.forEach((quota, index) => {
    const chip = document.createElement('div');
    chip.className = 'quota-chip';
    chip.dataset.kind = kind;
    chip.dataset.index = index;
    if (checked[index]) {
      chip.classList.add('checked');
      chip.textContent = '✓';
      chip.title = `${kind === 'row' ? 'Row' : 'Column'} ${index + 1}: met (needed ${quota})`;
    } else {
      chip.textContent = String(quota);
      chip.title = `${kind === 'row' ? 'Row' : 'Column'} ${index + 1}: needs a match of ${quota} or higher`;
    }
    el.appendChild(chip);
  });
}

export function pulseQuotas(rowEl, colEl, lines) {
  for (const { kind, index } of lines) {
    const host = kind === 'row' ? rowEl : colEl;
    const chip = host.querySelector(`.quota-chip[data-index="${index}"]`);
    if (chip) {
      chip.classList.add('quota-pop');
      setTimeout(() => chip.classList.remove('quota-pop'), 500);
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
