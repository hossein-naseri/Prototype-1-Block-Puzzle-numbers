import assert from 'node:assert';
import { createBoard, cellAt } from '../core/board.js';
import { canPlace } from '../core/legality.js';
import { applyPlacement } from '../core/resolve.js';
import { bloom } from '../variants/bloom.js';
import { orderBoard } from '../variants/orderBoard.js';
import { lineLevel } from '../variants/lineLevel.js';
import { pressure } from '../variants/pressure.js';
import { blueprint } from '../variants/blueprint.js';
import { LEVELS } from '../config/levels.js';
import { variantConfigs } from '../config/config.js';
import { solveLevel } from '../core/solver.js';

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

t('bloom collapses a group of 3+ equal orthogonally-connected tiles', () => {
  const board = createBoard(4);
  // Three 1s in an L, connected orthogonally: (0,0) (0,1) (1,1)
  cellAt(board, 0, 0).value = 1;
  cellAt(board, 0, 1).value = 1;
  cellAt(board, 1, 1).value = 1; // just placed by this turn's block
  const placement = {
    changedCells: [{ r: 1, c: 1, op: 'plus1', prevValue: 0, value: 1 }],
  };
  const result = bloom.onPlacementResolved(
    { size: 4, cells: board.cells.map((c) => ({ ...c })) },
    placement,
    {},
    variantConfigs.bloom
  );
  const winnerMutation = result.mutations.find((m) => m.patch.value === 2);
  assert.ok(winnerMutation, 'one tile should become value+1');
  const zeroed = result.mutations.filter((m) => m.patch.value === 0);
  assert.strictEqual(zeroed.length, 2, 'the other two group tiles reset to 0');
  assert.strictEqual(result.scoreDelta, 1 * 1 * 3); // value^2 * groupSize * chain(1)
});

t('bloom does not collapse groups smaller than minGroupSize', () => {
  const board = createBoard(4);
  cellAt(board, 0, 0).value = 1;
  cellAt(board, 0, 1).value = 1;
  const placement = { changedCells: [{ r: 0, c: 1, op: 'plus1', prevValue: 0, value: 1 }] };
  const result = bloom.onPlacementResolved(board, placement, {}, variantConfigs.bloom);
  assert.strictEqual(result.mutations.length, 0);
  assert.strictEqual(result.scoreDelta, 0);
});

t('order board banks a tile that lands exactly on target', () => {
  const board = createBoard(4);
  cellAt(board, 0, 0).value = 3; // just placed
  const placement = { changedCells: [{ r: 0, c: 0, op: 'plus1', prevValue: 2, value: 3 }] };
  const result = orderBoard.onPlacementResolved(board, placement, { target: 3, banks: 0 }, variantConfigs.orderBoard);
  const bankMutation = result.mutations.find((m) => m.r === 0 && m.c === 0);
  assert.strictEqual(bankMutation.patch.value, 0);
  assert.strictEqual(result.variantState.banks, 1);
  assert.strictEqual(result.scoreDelta, variantConfigs.orderBoard.bankScorePerTarget * 3);
});

t('order board locks a tile that overshoots target into a stone', () => {
  const board = createBoard(4);
  cellAt(board, 0, 0).value = 5;
  const placement = { changedCells: [{ r: 0, c: 0, op: 'plus1', prevValue: 4, value: 5 }] };
  const result = orderBoard.onPlacementResolved(board, placement, { target: 3, banks: 0 }, variantConfigs.orderBoard);
  const lockMutation = result.mutations.find((m) => m.r === 0 && m.c === 0);
  assert.ok(lockMutation.patch.allowedOps.has('minus1'));
  assert.ok(lockMutation.patch.allowedOps.has('div2'));
  assert.ok(!lockMutation.patch.allowedOps.has('plus1'));
});

t('order board target increments every N banks', () => {
  const board = createBoard(4);
  cellAt(board, 0, 0).value = 3;
  const placement = { changedCells: [{ r: 0, c: 0, op: 'plus1', prevValue: 2, value: 3 }] };
  const config = { ...variantConfigs.orderBoard, incrementEvery: 1 };
  const result = orderBoard.onPlacementResolved(board, placement, { target: 3, banks: 0 }, config);
  assert.strictEqual(result.variantState.target, 4);
});

t('line level clears a row of all-equal non-zero tiles', () => {
  const board = createBoard(4);
  for (let c = 0; c < 4; c++) cellAt(board, 1, c).value = 6;
  const placement = { changedCells: [{ r: 1, c: 3, op: 'plus1', prevValue: 5, value: 6 }] };
  const result = lineLevel.onPlacementResolved(board, placement, {}, variantConfigs.lineLevel);
  assert.strictEqual(result.mutations.length, 4);
  assert.ok(result.mutations.every((m) => m.patch.value === 0));
  assert.strictEqual(result.scoreDelta, 6 * 4);
});

t('line level does not clear a row that is not fully uniform', () => {
  const board = createBoard(4);
  cellAt(board, 1, 0).value = 6;
  cellAt(board, 1, 1).value = 6;
  cellAt(board, 1, 2).value = 6;
  cellAt(board, 1, 3).value = 5;
  const placement = { changedCells: [{ r: 1, c: 3, op: 'plus1', prevValue: 4, value: 5 }] };
  const result = lineLevel.onPlacementResolved(board, placement, {}, variantConfigs.lineLevel);
  assert.strictEqual(result.mutations.length, 0);
});

t('pressure cooker turns a tile above the cap into a permanent dead cell', () => {
  const board = createBoard(4);
  cellAt(board, 2, 2).value = 13; // just pushed over the default cap of 12
  const placement = { changedCells: [{ r: 2, c: 2, op: 'plus1', prevValue: 12, value: 13 }] };
  const result = pressure.onPlacementResolved(board, placement, {}, variantConfigs.pressure);
  const deadMutation = result.mutations.find((m) => m.r === 2 && m.c === 2);
  assert.strictEqual(deadMutation.patch.blocked, true);
  assert.strictEqual(canPlace(board, [{ r: 2, c: 2, op: 'none' }]), true, 'not yet blocked in this snapshot');
  const nextBoard = { size: 4, cells: board.cells.map((c) => ({ ...c })) };
  cellAt(nextBoard, 2, 2).blocked = true;
  assert.strictEqual(canPlace(nextBoard, [{ r: 2, c: 2, op: 'none' }]), false, 'blocked once mutation applied');
});

t('blueprint checkWin requires an exact match against every target cell', () => {
  const board = createBoard(3);
  const level = LEVELS[0]; // target: (0,0)=1,(1,1)=1,(2,2)=1
  const config = { ...variantConfigs.blueprint, level };
  assert.strictEqual(blueprint.checkWin(board, {}, config), false);
  level.targetBoard.forEach((v, i) => {
    board.cells[i].value = v;
  });
  assert.strictEqual(blueprint.checkWin(board, {}, config), true);
});

t('every authored Blueprint level is solvable at its authored par', () => {
  for (const level of LEVELS) {
    const result = solveLevel(blueprint, level, variantConfigs.blueprint);
    assert.ok(result.solvable, `${level.id} should be solvable`);
    assert.strictEqual(result.par, level.par, `${level.id} par mismatch`);
  }
});

console.log('\nsanity checks complete');
