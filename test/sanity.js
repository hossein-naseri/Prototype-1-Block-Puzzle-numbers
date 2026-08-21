import assert from 'node:assert';
import { createBoard, cellAt } from '../core/board.js';
import { canPlace } from '../core/legality.js';
import { applyPlacement } from '../core/resolve.js';

function t(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

t('placement off the edge of the board is illegal', () => {
  const board = createBoard(4);
  const abs = [
    { r: 0, c: 3, op: 'none' },
    { r: 0, c: 4, op: 'none' }, // off board
    { r: 0, c: 5, op: 'none' },
  ];
  assert.strictEqual(canPlace(board, abs), false);
});

t('-1 cannot take a tile below 0', () => {
  const board = createBoard(4);
  const abs = [{ r: 0, c: 0, op: 'minus1' }];
  assert.strictEqual(canPlace(board, abs), false);
});

t('/2 requires an even, non-zero value', () => {
  const board = createBoard(4);
  assert.strictEqual(canPlace(board, [{ r: 0, c: 0, op: 'div2' }]), false); // 0
  cellAt(board, 0, 0).value = 3;
  assert.strictEqual(canPlace(board, [{ r: 0, c: 0, op: 'div2' }]), false); // odd
  cellAt(board, 0, 0).value = 4;
  assert.strictEqual(canPlace(board, [{ r: 0, c: 0, op: 'div2' }]), true); // even
});

t('one illegal cell fails the whole placement', () => {
  const board = createBoard(4);
  cellAt(board, 0, 1).value = 3; // odd, /2 illegal here
  const abs = [
    { r: 0, c: 0, op: 'plus1' },
    { r: 0, c: 1, op: 'div2' },
  ];
  assert.strictEqual(canPlace(board, abs), false);
});

t('blocked cells reject every op, including none', () => {
  const board = createBoard(4);
  cellAt(board, 1, 1).blocked = true;
  assert.strictEqual(canPlace(board, [{ r: 1, c: 1, op: 'none' }]), false);
});

t('a stone-locked cell only accepts its allowed ops (plus none)', () => {
  const board = createBoard(4);
  const stone = cellAt(board, 2, 2);
  stone.value = 5;
  stone.allowedOps = new Set(['minus1', 'div2']);
  assert.strictEqual(canPlace(board, [{ r: 2, c: 2, op: 'plus1' }]), false);
  assert.strictEqual(canPlace(board, [{ r: 2, c: 2, op: 'minus1' }]), true);
  assert.strictEqual(canPlace(board, [{ r: 2, c: 2, op: 'none' }]), true);
});

t('applyPlacement mutates only the covered cells with the right op', () => {
  const board = createBoard(4);
  cellAt(board, 0, 0).value = 4;
  const abs = [
    { r: 0, c: 0, op: 'x2' },
    { r: 0, c: 1, op: 'plus1' },
  ];
  const { board: next, changedCells } = applyPlacement(board, abs);
  assert.strictEqual(cellAt(next, 0, 0).value, 8);
  assert.strictEqual(cellAt(next, 0, 1).value, 1);
  assert.strictEqual(cellAt(board, 0, 0).value, 4, 'original board must not mutate');
  assert.strictEqual(changedCells.length, 2);
});

console.log('\nsanity checks complete');
