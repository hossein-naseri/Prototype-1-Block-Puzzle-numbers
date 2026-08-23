import assert from 'node:assert';
import { createBoard, cellAt } from '../core/board.js';
import { canPlace } from '../core/legality.js';
import { applyPlacement } from '../core/resolve.js';
import { createGame, placeBlock, tileScore } from '../core/engine.js';
import { generateBlock, createBlock, absoluteCells } from '../core/blocks.js';
import { SeededRng } from '../core/rng.js';
import { lineLevel } from '../variants/lineLevel.js';
import { orderBoard } from '../variants/orderBoard.js';
import { fight, resolveConversions, countControl, controlTarget, rollThreats } from '../variants/fight.js';
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
const FIGHT = variantConfigs.fight;

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
  const { board: next } = applyPlacement(board, [{ r: 0, c: 0, op: 'minus1' }], CFG);
  assert.strictEqual(cellAt(next, 0, 0).value, 0);
});

t('/2 now halves odd values too, rounding the magnitude down', () => {
  const board = createBoard(3);
  cellAt(board, 0, 0).value = 5;
  assert.strictEqual(canPlace(board, [{ r: 0, c: 0, op: 'div2' }]), true, 'odd is legal now');
  const { board: next } = applyPlacement(board, [{ r: 0, c: 0, op: 'div2' }], CFG);
  assert.strictEqual(cellAt(next, 0, 0).value, 2, '5 / 2 = 2');
});

t('/2 on a red value rounds its magnitude down too', () => {
  const board = createBoard(3);
  cellAt(board, 0, 0).value = -5;
  const { board: next } = applyPlacement(board, [{ r: 0, c: 0, op: 'div2' }], FIGHT);
  assert.strictEqual(cellAt(next, 0, 0).value, -2, 'red 5 -> red 2, not red 3');
});

t('one illegal cell fails the whole placement', () => {
  const board = createBoard(3);
  cellAt(board, 0, 1).allowedOps = new Set(['minus1']); // stone: +1 not allowed
  assert.strictEqual(
    canPlace(board, [
      { r: 0, c: 0, op: 'plus1' }, // fine on its own
      { r: 0, c: 1, op: 'plus1' }, // rejected by the stone
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
  const { board: next, strikesAdded } = applyPlacement(board, [{ r: 1, c: 1, op: 'plus1' }], CFG);
  assert.strictEqual(cellAt(next, 1, 1).value, 9, 'resets to the cap, not above it');
  assert.strictEqual(strikesAdded, 1);
});

t('overshooting the cap by a lot still costs exactly one strike per tile', () => {
  const board = createBoard(3);
  cellAt(board, 0, 0).value = 8; // x2 -> 16, far above the cap
  const { board: next, strikesAdded } = applyPlacement(board, [{ r: 0, c: 0, op: 'x2' }], CFG);
  assert.strictEqual(cellAt(next, 0, 0).value, 9);
  assert.strictEqual(strikesAdded, 1);
});

t('staying at or under the cap costs no strike', () => {
  const board = createBoard(3);
  cellAt(board, 0, 0).value = 8;
  const { strikesAdded } = applyPlacement(board, [{ r: 0, c: 0, op: 'plus1' }], CFG);
  assert.strictEqual(strikesAdded, 0);
});

// ---- scoring / bars -------------------------------------------------

t('score for a tile is its value squared', () => {
  assert.strictEqual(tileScore(4), 16);
  assert.strictEqual(tileScore(9), 81);
});

t('a matched row of 4s scores 16 per tile and is attributed to that row', () => {
  const board = createBoard(3);
  for (let c = 0; c < 3; c++) cellAt(board, 1, c).value = 4;
  const result = lineLevel.onPlacementResolved(board, { changedCells: [] }, {}, CFG);
  assert.strictEqual(result.scoredTiles.length, 3);
  assert.ok(result.scoredTiles.every((tile) => tileScore(tile.value) === 16));
  // The match was made on the row, so only the row's quota is a candidate.
  assert.deepStrictEqual(result.scoredLines, [{ kind: 'row', index: 1, value: 4 }]);
});

t('a matched line keeps its values - nothing is reset to 0', () => {
  const board = createBoard(3);
  for (let c = 0; c < 3; c++) cellAt(board, 1, c).value = 4;
  const result = lineLevel.onPlacementResolved(board, { changedCells: [] }, {}, CFG);
  assert.deepStrictEqual(result.mutations, [], 'no mutations at all, so no zeroing');
});

t('a standing match does not re-score on later placements', () => {
  const board = createBoard(3);
  for (let c = 0; c < 3; c++) cellAt(board, 1, c).value = 4;
  const first = lineLevel.onPlacementResolved(board, { changedCells: [] }, { matchedAt: {} }, CFG);
  assert.strictEqual(first.scoredLines.length, 1);

  const second = lineLevel.onPlacementResolved(board, { changedCells: [] }, first.variantState, CFG);
  assert.deepStrictEqual(second.scoredLines, [], 'unchanged line must not fire again');
  assert.deepStrictEqual(second.scoredTiles, []);
});

t('re-matching a line at a higher value fires again', () => {
  const board = createBoard(3);
  for (let c = 0; c < 3; c++) cellAt(board, 1, c).value = 4;
  const first = lineLevel.onPlacementResolved(board, { changedCells: [] }, { matchedAt: {} }, CFG);

  for (let c = 0; c < 3; c++) cellAt(board, 1, c).value = 7; // upgraded
  const second = lineLevel.onPlacementResolved(board, { changedCells: [] }, first.variantState, CFG);
  assert.deepStrictEqual(second.scoredLines, [{ kind: 'row', index: 1, value: 7 }]);
});

t('a board filled with one value matches every row and column at once', () => {
  const board = createBoard(3);
  for (const cell of board.cells) cell.value = 9;
  const result = lineLevel.onPlacementResolved(board, { changedCells: [] }, { matchedAt: {} }, CFG);
  assert.strictEqual(result.scoredLines.length, 6, '3 rows + 3 columns');
  assert.ok(result.scoredLines.every((l) => l.value === 9));
});

t('line level does not match a row that is not fully uniform', () => {
  const board = createBoard(3);
  cellAt(board, 1, 0).value = 6;
  cellAt(board, 1, 1).value = 6;
  cellAt(board, 1, 2).value = 5;
  const result = lineLevel.onPlacementResolved(board, { changedCells: [] }, {}, CFG);
  assert.strictEqual(result.scoredTiles.length, 0);
});

t('a row and a column matching at once are both reported', () => {
  const board = createBoard(3);
  for (let i = 0; i < 3; i++) {
    cellAt(board, 1, i).value = 2; // middle row
    cellAt(board, i, 1).value = 2; // middle column
  }
  const result = lineLevel.onPlacementResolved(board, { changedCells: [] }, { matchedAt: {} }, CFG);
  assert.deepStrictEqual(
    result.scoredLines.sort((a, b) => a.kind.localeCompare(b.kind)),
    [
      { kind: 'col', index: 1, value: 2 },
      { kind: 'row', index: 1, value: 2 },
    ]
  );
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
  const patch = result.mutations.find((m) => m.r === 0 && m.c === 0).patch;
  assert.ok(!('value' in patch), 'a banked tile keeps its value');
  assert.strictEqual(patch.allowedOps, null, 'only the stone lock is released');
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

// ---- fight mode ------------------------------------------------------

function fightBoard(rows) {
  const size = rows.length;
  const board = createBoard(size);
  rows.forEach((row, r) => row.forEach((v, c) => { cellAt(board, r, c).value = v; }));
  return board;
}

t('fight: signed values are not clamped at 0', () => {
  const board = createBoard(3);
  const { board: next } = applyPlacement(board, [{ r: 0, c: 0, op: 'minus1' }], FIGHT);
  assert.strictEqual(cellAt(next, 0, 0).value, -1, '0 with red pressure becomes red 1');
});

t('fight: magnitude is capped in both directions, with no strikes', () => {
  const board = createBoard(3);
  cellAt(board, 0, 0).value = -8;
  const { board: next, strikesAdded } = applyPlacement(board, [{ r: 0, c: 0, op: 'x2' }], FIGHT);
  assert.strictEqual(cellAt(next, 0, 0).value, -9, 'red 16 clamps to the cap');
  assert.strictEqual(strikesAdded, 0, 'signed mode never charges strikes');
});

t('fight: the brief\'s worked example converts', () => {
  // centre red 3; red 1 north, red 2 east (red total 6);
  // green 4 west, green 3 south (green total 7). 6 < 7 -> flips.
  const board = fightBoard([
    [0, -1, 0],
    [4, -3, -2],
    [0, 3, 0],
  ]);
  const flips = resolveConversions(board);
  const centre = flips.find((f) => f.r === 1 && f.c === 1);
  assert.ok(centre, 'the centre red tile should convert');
  assert.strictEqual(centre.to, 3, 'it keeps its magnitude');
});

t('fight: a tie leaves the red tile alone', () => {
  // red 3 + red 1 = 4 vs green 2 + green 2 = 4. Not strictly less.
  const board = fightBoard([
    [0, -1, 0],
    [2, -3, 2],
    [0, 0, 0],
  ]);
  assert.deepStrictEqual(resolveConversions(board), []);
});

t('fight: red must be strictly out-muscled', () => {
  // red 3 alone vs green 2 + green 2 = 4 > 3 -> converts
  const board = fightBoard([
    [0, 0, 0],
    [2, -3, 2],
    [0, 0, 0],
  ]);
  assert.strictEqual(resolveConversions(board).length, 1);
});

t('fight: fewer than 2 green neighbours never converts, however strong', () => {
  const board = fightBoard([
    [0, 0, 0],
    [9, -1, 0],
    [0, 0, 0],
  ]);
  assert.deepStrictEqual(resolveConversions(board), [], 'one green 9 is not enough');
});

t('fight: red neighbours prop up the defending tile', () => {
  // without the red 4 to the north this would convert (1 < 2+2)
  const weak = fightBoard([
    [0, 0, 0],
    [2, -1, 2],
    [0, 0, 0],
  ]);
  assert.strictEqual(resolveConversions(weak).length, 1);

  const propped = fightBoard([
    [0, -4, 0],
    [2, -1, 2],
    [0, 0, 0],
  ]);
  const flippedCentre = resolveConversions(propped).some((f) => f.r === 1 && f.c === 1);
  assert.strictEqual(flippedCentre, false, 'red 1 + red 4 = 5 >= green 4');
});

t('fight: red can no longer convert green', () => {
  const board = fightBoard([
    [-9, 1, -9],
    [0, -9, 0],
    [0, 0, 0],
  ]);
  const flippedGreen = resolveConversions(board).some((f) => f.from > 0);
  assert.strictEqual(flippedGreen, false, 'conversion is green-only now');
});

t('fight: conversions cascade until stable', () => {
  // (1,1) converts first (red 1 < green 2+2), which then gives (2,1) the
  // second green neighbour it needs.
  const board = fightBoard([
    [0, 2, 0],
    [2, -1, 0],
    [0, -1, 2],
  ]);
  const flips = resolveConversions(board);
  const at = (r, c) => flips.some((f) => f.r === r && f.c === c);
  assert.ok(at(1, 1), 'first flip');
  assert.ok(at(2, 1), 'chain reaction flip');
});

t('fight: a corner red tile can be converted by its two neighbours', () => {
  const board = fightBoard([
    [-1, 2, 0],
    [2, 0, 0],
    [0, 0, 0],
  ]);
  const flips = resolveConversions(board);
  assert.deepStrictEqual(flips, [{ r: 0, c: 0, from: -1, to: 1 }]);
});

t('fight: neutral 0 tiles are neither converted nor counted', () => {
  const board = fightBoard([
    [0, 3, 0],
    [3, 0, 0],
    [0, 0, 0],
  ]);
  assert.deepStrictEqual(resolveConversions(board), [], 'a 0 tile is not a target');
});

t('fight: control target is more than 70% of the board', () => {
  assert.strictEqual(controlTarget(9, 0.7), 7, '9 * 0.7 = 6.3, so 7');
  assert.strictEqual(controlTarget(16, 0.7), 12, '16 * 0.7 = 11.2, so 12');
  assert.strictEqual(controlTarget(10, 0.7), 8, 'exactly 7 is not "more than"');
});

t('fight: holding the target share wins, and the mirror loses', () => {
  const green = fightBoard([
    [1, 1, 1],
    [1, 1, 1],
    [1, 0, 0],
  ]);
  assert.deepStrictEqual(countControl(green), { green: 7, red: 0, total: 9 });
  assert.strictEqual(fight.getOutcome(green, {}, FIGHT).won, true);

  const red = fightBoard([
    [-1, -1, -1],
    [-1, -1, -1],
    [-1, 0, 0],
  ]);
  assert.strictEqual(fight.getOutcome(red, {}, FIGHT).lost, true);
});

t('fight: the engine applies a turn-end conversion to the real board', () => {
  // Full path: place the last block of a hand -> onTurnEnd fires -> threats
  // land -> conversions resolve -> mutations land on the state's board.
  const board = fightBoard([
    [0, 0, 0],
    [3, -1, 3],
    [0, 0, 0],
  ]);
  const base = createGame(fight, FIGHT, 5);
  const block = createBlock('DOT', ['none']);
  const game = {
    ...base,
    board,
    hand: [block], // spending this empties the hand and ends the turn
    variantState: { threats: {}, round: 1 },
  };
  const result = placeBlock(fight, game, block.id, 0, 0);
  assert.ok(result.ok);
  assert.strictEqual(
    result.state.board.cells[1 * 3 + 1].value,
    1,
    'red 1 (< green 3+3) should be green 1 on the resolved board'
  );
});

t('fight: an already-decided starting board reports at once', () => {
  // startValue 4 hands green the whole board before a block is placed.
  const game = createGame(fight, { ...FIGHT, startValue: 4 }, 11);
  assert.strictEqual(game.gameOver, true);
  assert.strictEqual(game.won, true);
  assert.match(game.outcomeReason, /green holds 9\/9/);
});

t('fight: 6 of 9 tiles is not yet a win', () => {
  const board = fightBoard([
    [1, 1, 1],
    [1, 1, 1],
    [0, 0, 0],
  ]);
  assert.strictEqual(fight.getOutcome(board, {}, FIGHT).won, undefined);
});

t('fight: threats pick the configured number of distinct tiles, 1..maxStacks', () => {
  const rng = new SeededRng(4242);
  const board = createBoard(3);
  const threats = rollThreats(rng, board, FIGHT);
  const keys = Object.keys(threats);
  assert.strictEqual(keys.length, 3);
  assert.strictEqual(new Set(keys).size, 3, 'distinct tiles');
  for (const stacks of Object.values(threats)) {
    assert.ok(stacks >= 1 && stacks <= 2, `stacks ${stacks} out of range`);
  }
});

t('fight: a run starts with threats already queued', () => {
  const game = createGame(fight, FIGHT, 99);
  assert.strictEqual(Object.keys(game.variantState.threats).length, 3);
  assert.strictEqual(game.variantState.round, 1);
  assert.strictEqual(game.rowQuotas.length, 0, 'fight opts out of line quotas');
});

t('fight: queued threats land at the end of the turn and advance the round', () => {
  const board = createBoard(3);
  const rng = new SeededRng(7);
  const state = { threats: { '0,0': 2, '1,1': 1 }, round: 1 };
  const result = fight.onTurnEnd(board, state, FIGHT, rng);
  const byCell = Object.fromEntries(result.mutations.map((m) => [`${m.r},${m.c}`, m.patch.value]));
  assert.strictEqual(byCell['0,0'], -2, '2 triangles -> red 2');
  assert.strictEqual(byCell['1,1'], -1, '1 triangle -> red 1');
  assert.strictEqual(result.variantState.round, 2);
  assert.strictEqual(Object.keys(result.variantState.threats).length, 3, 'next turn re-rolled');
});

t('fight: a placement converts immediately, without waiting for turn end', () => {
  const board = fightBoard([
    [0, 0, 0],
    [2, -1, 2],
    [0, 0, 0],
  ]);
  const result = fight.onPlacementResolved(board, { changedCells: [] }, {}, FIGHT);
  assert.ok(
    result.mutations.some((m) => m.r === 1 && m.c === 1 && m.patch.value === 1),
    'red 1 out-muscled by green 2+2 flips on the placement itself'
  );
});

t('fight: conversions are re-checked after the threats land', () => {
  // Nothing to convert until the threat drops a red tile between two greens.
  const board = fightBoard([
    [0, 0, 0],
    [2, 0, 2],
    [0, 0, 0],
  ]);
  assert.deepStrictEqual(fight.onPlacementResolved(board, { changedCells: [] }, {}, FIGHT).mutations, []);
  const atEnd = fight.onTurnEnd(board, { threats: { '1,1': 1 }, round: 1 }, FIGHT, new SeededRng(3));
  const centre = atEnd.mutations.filter((m) => m.r === 1 && m.c === 1);
  assert.strictEqual(centre.at(-1).patch.value, 1, 'threat makes it red 1, then it converts to green 1');
});

t('fight: a threat on a green tile lowers it rather than flipping it', () => {
  const board = fightBoard([
    [5, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]);
  const result = fight.onTurnEnd(board, { threats: { '0,0': 2 }, round: 1 }, FIGHT, new SeededRng(1));
  const m = result.mutations.find((x) => x.r === 0 && x.c === 0);
  assert.strictEqual(m.patch.value, 3, 'green 5 minus 2 red pressure = green 3');
});

console.log('\nsanity checks complete');
