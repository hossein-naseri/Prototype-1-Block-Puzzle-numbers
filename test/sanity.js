import assert from 'node:assert';
import { createBoard, cellAt } from '../core/board.js';
import { canPlace } from '../core/legality.js';
import { applyPlacement } from '../core/resolve.js';
import { createGame, placeBlock, tileScore } from '../core/engine.js';
import { generateBlock, createBlock, absoluteCells } from '../core/blocks.js';
import { SeededRng } from '../core/rng.js';
import { lineLevel } from '../variants/lineLevel.js';
import { orderBoard } from '../variants/orderBoard.js';
import { variantConfigs } from '../config/config.js';

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

const CFG = variantConfigs.lineLevel;

// ---- legality -------------------------------------------------------

t('placement off the edge of the board is illegal', () => {
  const board = createBoard(3);
  assert.strictEqual(
    canPlace(board, [
      { r: 0, c: 2, op: 'none' },
      { r: 0, c: 3, op: 'none' },
    ]),
    false
  );
});

t('-1 on 0 is now legal and clamps rather than going negative', () => {
  const board = createBoard(3);
  assert.strictEqual(canPlace(board, [{ r: 0, c: 0, op: 'minus1' }]), true);
  const { board: next } = applyPlacement(board, [{ r: 0, c: 0, op: 'minus1' }], 9);
  assert.strictEqual(cellAt(next, 0, 0).value, 0);
});

t('/2 requires an even value but is fine on 0', () => {
  const board = createBoard(3);
  assert.strictEqual(canPlace(board, [{ r: 0, c: 0, op: 'div2' }]), true); // 0 -> 0
  cellAt(board, 0, 0).value = 3;
  assert.strictEqual(canPlace(board, [{ r: 0, c: 0, op: 'div2' }]), false); // odd
  cellAt(board, 0, 0).value = 4;
  assert.strictEqual(canPlace(board, [{ r: 0, c: 0, op: 'div2' }]), true);
});

t('one illegal cell fails the whole placement', () => {
  const board = createBoard(3);
  cellAt(board, 0, 1).value = 3; // odd, /2 illegal here
  assert.strictEqual(
    canPlace(board, [
      { r: 0, c: 0, op: 'plus1' },
      { r: 0, c: 1, op: 'div2' },
    ]),
    false
  );
});

t('a stone-locked cell only accepts its allowed ops (plus none)', () => {
  const board = createBoard(3);
  const stone = cellAt(board, 2, 2);
  stone.value = 5;
  stone.allowedOps = new Set(['minus1', 'div2']);
  assert.strictEqual(canPlace(board, [{ r: 2, c: 2, op: 'plus1' }]), false);
  assert.strictEqual(canPlace(board, [{ r: 2, c: 2, op: 'minus1' }]), true);
  assert.strictEqual(canPlace(board, [{ r: 2, c: 2, op: 'none' }]), true);
});

// ---- strike cap -----------------------------------------------------

t('a tile pushed above maxValue costs a strike and resets to maxValue', () => {
  const board = createBoard(3);
  cellAt(board, 1, 1).value = 9;
  const { board: next, strikesAdded } = applyPlacement(board, [{ r: 1, c: 1, op: 'plus1' }], 9);
  assert.strictEqual(cellAt(next, 1, 1).value, 9, 'resets to the cap, not above it');
  assert.strictEqual(strikesAdded, 1);
});

t('overshooting the cap by a lot still costs exactly one strike per tile', () => {
  const board = createBoard(3);
  cellAt(board, 0, 0).value = 8; // x2 -> 16, far above the cap
  const { board: next, strikesAdded } = applyPlacement(board, [{ r: 0, c: 0, op: 'x2' }], 9);
  assert.strictEqual(cellAt(next, 0, 0).value, 9);
  assert.strictEqual(strikesAdded, 1);
});

t('staying at or under the cap costs no strike', () => {
  const board = createBoard(3);
  cellAt(board, 0, 0).value = 8;
  const { strikesAdded } = applyPlacement(board, [{ r: 0, c: 0, op: 'plus1' }], 9);
  assert.strictEqual(strikesAdded, 0);
});

// ---- scoring / bars -------------------------------------------------

t('score for a tile is its value squared', () => {
  assert.strictEqual(tileScore(4), 16);
  assert.strictEqual(tileScore(9), 81);
});

t('a cleared row of 4s scores 16 per tile and is attributed to that row', () => {
  const board = createBoard(3);
  for (let c = 0; c < 3; c++) cellAt(board, 1, c).value = 4;
  const result = lineLevel.onPlacementResolved(board, { changedCells: [] }, {}, CFG);
  assert.strictEqual(result.scoredTiles.length, 3);
  assert.ok(result.scoredTiles.every((tile) => tileScore(tile.value) === 16));
  assert.ok(result.mutations.every((m) => m.patch.value === 0));
  // The match was made on the row, so only the row's quota is a candidate.
  assert.deepStrictEqual(result.scoredLines, [{ kind: 'row', index: 1, value: 4 }]);
});

t('line level does not clear a row that is not fully uniform', () => {
  const board = createBoard(3);
  cellAt(board, 1, 0).value = 6;
  cellAt(board, 1, 1).value = 6;
  cellAt(board, 1, 2).value = 5;
  const result = lineLevel.onPlacementResolved(board, { changedCells: [] }, {}, CFG);
  assert.strictEqual(result.scoredTiles.length, 0);
});

t('a tile at the crossing of two clearing lines only scores once', () => {
  const board = createBoard(3);
  for (let i = 0; i < 3; i++) {
    cellAt(board, 1, i).value = 2; // middle row
    cellAt(board, i, 1).value = 2; // middle column
  }
  const result = lineLevel.onPlacementResolved(board, { changedCells: [] }, {}, CFG);
  const keys = result.scoredTiles.map((tile) => `${tile.r},${tile.c}`);
  assert.strictEqual(new Set(keys).size, keys.length, 'no tile scored twice');
  assert.strictEqual(keys.length, 5, 'a full plus-shape is 5 distinct tiles');
});

t('quotas are rolled for every row and column, within 1..maxValue', () => {
  const game = createGame(lineLevel, { ...CFG, boardSize: 4, maxValue: 9 }, 31);
  assert.strictEqual(game.rowQuotas.length, 4);
  assert.strictEqual(game.colQuotas.length, 4);
  for (const q of [...game.rowQuotas, ...game.colQuotas]) {
    assert.ok(q >= 1 && q <= 9, `quota ${q} out of range`);
  }
  assert.ok(game.rowChecked.every((v) => v === false));
});

t('a lowered maxValue keeps quotas reachable', () => {
  const game = createGame(lineLevel, { ...CFG, boardSize: 3, maxValue: 4 }, 77);
  for (const q of [...game.rowQuotas, ...game.colQuotas]) assert.ok(q <= 4, `quota ${q} > cap`);
});

t('a match at or above the quota checks that line; below it does not', () => {
  const board = createBoard(3);
  for (let c = 0; c < 3; c++) cellAt(board, 1, c).value = 4;
  const config = { ...CFG, boardSize: 3 };
  const base = createGame(lineLevel, config, 1);
  const block = createBlock('DOT', ['plus1']);

  const meets = { ...base, board, rowQuotas: [9, 4, 9], colQuotas: [9, 9, 9], hand: [block] };
  const metResult = placeBlock(lineLevel, meets, block.id, 2, 2);
  assert.strictEqual(metResult.state.rowChecked[1], true, 'quota 4, match 4 -> met');
  assert.deepStrictEqual(metResult.state.colChecked, [false, false, false], 'a row match does not check columns');

  const board2 = createBoard(3);
  for (let c = 0; c < 3; c++) cellAt(board2, 1, c).value = 4;
  const misses = { ...base, board: board2, rowQuotas: [9, 5, 9], colQuotas: [9, 9, 9], hand: [createBlock('DOT', ['plus1'])] };
  const missResult = placeBlock(lineLevel, misses, misses.hand[0].id, 2, 2);
  assert.strictEqual(missResult.state.rowChecked[1], false, 'quota 5, match 4 -> not met');
});

t('a checkmark is permanent once earned', () => {
  const board = createBoard(3);
  for (let c = 0; c < 3; c++) cellAt(board, 1, c).value = 4;
  const base = createGame(lineLevel, { ...CFG, boardSize: 3 }, 1);
  const block = createBlock('DOT', ['plus1']);
  const game = { ...base, board, rowQuotas: [9, 4, 9], colQuotas: [9, 9, 9], rowChecked: [false, true, false], hand: [block] };
  const result = placeBlock(lineLevel, game, block.id, 2, 2);
  assert.strictEqual(result.state.rowChecked[1], true);
});

t('checking every row and column quota wins the run', () => {
  const board = createBoard(3);
  for (let c = 0; c < 3; c++) cellAt(board, 1, c).value = 4;
  const base = createGame(lineLevel, { ...CFG, boardSize: 3 }, 1);
  const game = {
    ...base,
    board,
    rowQuotas: [1, 4, 1],
    colQuotas: [1, 1, 1],
    rowChecked: [true, false, true],
    colChecked: [true, true, true],
    hand: [createBlock('DOT', ['plus1'])],
  };
  const result = placeBlock(lineLevel, game, game.hand[0].id, 2, 2);
  assert.strictEqual(result.state.rowChecked[1], true, 'last outstanding quota met');
  assert.strictEqual(result.state.won, true);
  assert.strictEqual(result.state.gameOver, true);
});

t('order board attributes a bank to both the row and the column it sat on', () => {
  const board = createBoard(3);
  cellAt(board, 2, 1).value = 3;
  const placement = { changedCells: [{ r: 2, c: 1, op: 'plus1', prevValue: 2, value: 3 }] };
  const result = orderBoard.onPlacementResolved(board, placement, { target: 3, banks: 0 }, variantConfigs.orderBoard);
  assert.deepStrictEqual(result.scoredLines, [
    { kind: 'row', index: 2, value: 3 },
    { kind: 'col', index: 1, value: 3 },
  ]);
});

t('striking out beats filling the bars on the same placement', () => {
  const board = createBoard(3);
  for (const cell of board.cells) cell.value = 9; // every line uniform, and capped
  const config = { ...CFG, boardSize: 3, maxValue: 9, maxStrikes: 1 };
  const game = {
    ...createGame(lineLevel, config, 1),
    board,
    rowQuotas: [1, 1, 1],
    colQuotas: [1, 1, 1],
    rowChecked: [false, false, false],
    colChecked: [false, false, false],
  };
  const block = createBlock('DOT', ['plus1']); // 9 -> 10, strikes, resets to 9
  game.hand = [block];
  const result = placeBlock(lineLevel, game, block.id, 0, 0);
  assert.strictEqual(result.state.strikes, 1);
  assert.ok([...result.state.rowChecked, ...result.state.colChecked].every(Boolean), 'quotas were met too');
  assert.strictEqual(result.state.won, false, 'the strike lands first, so it is a loss');
  assert.strictEqual(result.state.gameOver, true);
});

t('reaching the strike limit loses the run', () => {
  const config = { ...CFG, boardSize: 3, maxValue: 9, maxStrikes: 1 };
  const board = createBoard(3);
  cellAt(board, 0, 0).value = 9;
  const game = { ...createGame(lineLevel, config, 1), board };
  const block = createBlock('DOT', ['plus1']);
  game.hand = [block];
  const result = placeBlock(lineLevel, game, block.id, 0, 0);
  assert.strictEqual(result.state.strikes, 1);
  assert.strictEqual(result.state.won, false);
  assert.strictEqual(result.state.gameOver, true);
});

// ---- order board ----------------------------------------------------

t('order board banks a tile that lands exactly on target and scores it', () => {
  const board = createBoard(3);
  cellAt(board, 0, 0).value = 3;
  const placement = { changedCells: [{ r: 0, c: 0, op: 'plus1', prevValue: 2, value: 3 }] };
  const result = orderBoard.onPlacementResolved(board, placement, { target: 3, banks: 0 }, variantConfigs.orderBoard);
  assert.deepStrictEqual(result.scoredTiles, [{ r: 0, c: 0, value: 3 }]);
  assert.strictEqual(result.mutations.find((m) => m.r === 0 && m.c === 0).patch.value, 0);
  assert.strictEqual(result.variantState.banks, 1);
});

t('order board locks a tile that overshoots target into a stone', () => {
  const board = createBoard(3);
  cellAt(board, 0, 0).value = 5;
  const placement = { changedCells: [{ r: 0, c: 0, op: 'plus1', prevValue: 4, value: 5 }] };
  const result = orderBoard.onPlacementResolved(board, placement, { target: 3, banks: 0 }, variantConfigs.orderBoard);
  const lock = result.mutations.find((m) => m.r === 0 && m.c === 0);
  assert.ok(lock.patch.allowedOps.has('minus1'));
  assert.ok(!lock.patch.allowedOps.has('plus1'));
});

// ---- block generation ------------------------------------------------

t('block sizes honour the configured spawn weights', () => {
  const rng = new SeededRng(1234);
  const config = { ...CFG, boardSize: 3, blockSizeWeights: { 1: 0, 2: 1, 3: 0 } };
  for (let i = 0; i < 50; i++) {
    assert.strictEqual(generateBlock(rng, config).cells.length, 2);
  }
});

t('all three block sizes appear when all are weighted', () => {
  const rng = new SeededRng(99);
  const config = { ...CFG, boardSize: 3, blockSizeWeights: { 1: 1, 2: 1, 3: 1 } };
  const sizes = new Set();
  for (let i = 0; i < 200; i++) sizes.add(generateBlock(rng, config).cells.length);
  assert.deepStrictEqual([...sizes].sort(), [1, 2, 3]);
});

t('every generated block carries at least one real operator', () => {
  const rng = new SeededRng(7);
  const config = { ...CFG, boardSize: 3, blockSizeWeights: { 1: 1, 2: 1, 3: 1 } };
  for (let i = 0; i < 300; i++) {
    const block = generateBlock(rng, config);
    assert.ok(block.cells.some((c) => c.op !== 'none'), block.shapeId);
  }
});

t('generated shapes always fit the configured board', () => {
  const rng = new SeededRng(21);
  const config = { ...CFG, boardSize: 2, blockSizeWeights: { 1: 1, 2: 1, 3: 1 } };
  for (let i = 0; i < 200; i++) {
    const block = generateBlock(rng, config);
    const maxR = Math.max(...block.cells.map((c) => c.dr));
    const maxC = Math.max(...block.cells.map((c) => c.dc));
    assert.ok(maxR < 2 && maxC < 2, `${block.shapeId} does not fit a 2x2 board`);
  }
});

// ---- board setup -----------------------------------------------------

t('board size is driven by config and gets one quota per row and column', () => {
  for (const size of [2, 3, 5]) {
    const game = createGame(lineLevel, { ...CFG, boardSize: size }, 5);
    assert.strictEqual(game.board.size, size);
    assert.strictEqual(game.board.cells.length, size * size);
    assert.strictEqual(game.rowQuotas.length, size);
    assert.strictEqual(game.colQuotas.length, size);
  }
});

t('startValue seeds every tile, and random stays strictly inside 0..maxValue', () => {
  const fixed = createGame(lineLevel, { ...CFG, startValue: 6 }, 42);
  assert.ok(fixed.board.cells.every((c) => c.value === 6));

  const random = createGame(lineLevel, { ...CFG, startValue: 'random', maxValue: 9 }, 42);
  assert.ok(random.board.cells.every((c) => c.value > 0 && c.value < 9));
});

t('opening deals are playable across many seeds', () => {
  let dead = 0;
  for (let s = 1; s <= 400; s++) {
    if (createGame(lineLevel, { ...CFG }, s * 7919).gameOver) dead++;
  }
  assert.strictEqual(dead, 0, `${dead} dead openings`);
});

console.log('\nsanity checks complete');
