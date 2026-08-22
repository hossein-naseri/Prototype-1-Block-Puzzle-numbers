import { SHAPES_BY_SIZE, BLOCK_SIZES, shapeById, shapeFitsBoard } from './shapes.js';

let uid = 0;
function nextId() {
  uid += 1;
  return `blk_${uid}`;
}

// Pick a tile count from the configured spawn weights, falling back to any
// size that has a shape fitting the board. Weights are relative, not
// percentages - the RNG normalizes them.
function pickSize(rng, config) {
  const weights = config.blockSizeWeights || { 1: 0, 2: 0, 3: 1 };
  const usable = {};
  for (const size of BLOCK_SIZES) {
    const weight = Number(weights[size]) || 0;
    const hasFittingShape = SHAPES_BY_SIZE[size].some((s) => shapeFitsBoard(s, config.boardSize));
    if (weight > 0 && hasFittingShape) usable[size] = weight;
  }
  if (Object.keys(usable).length === 0) {
    // Every configured size is unusable on this board - fall back to the
    // smallest size that fits at all, so generation can't deadlock.
    return BLOCK_SIZES.find((s) => SHAPES_BY_SIZE[s].some((sh) => shapeFitsBoard(sh, config.boardSize))) ?? 1;
  }
  return Number(rng.weighted(usable));
}

// Draw one operator per cell from the weighted config, re-rolling until at
// least one cell carries a real operator (every block must do something).
export function generateBlock(rng, config) {
  const size = pickSize(rng, config);
  const candidates = SHAPES_BY_SIZE[size].filter((s) => shapeFitsBoard(s, config.boardSize));
  const shape = rng.pick(candidates);

  let ops;
  do {
    ops = shape.cells.map(() => rng.weighted(config.operatorWeights));
  } while (ops.every((op) => op === 'none'));

  const cells = shape.cells.map(([dr, dc], i) => ({ dr, dc, op: ops[i] }));
  return { id: nextId(), shapeId: shape.id, size, cells };
}

// Build a block explicitly (no RNG).
export function createBlock(shapeId, ops) {
  const shape = shapeById(shapeId);
  const cells = shape.cells.map(([dr, dc], i) => ({ dr, dc, op: ops[i] }));
  return { id: nextId(), shapeId, size: shape.cells.length, cells };
}

export function generateHand(rng, config, size = 3) {
  const hand = [];
  for (let i = 0; i < size; i++) hand.push(generateBlock(rng, config));
  return hand;
}

// Absolute board cells a block would occupy if its origin (top-left of its
// bounding box) is placed at (anchorR, anchorC).
export function absoluteCells(block, anchorR, anchorC) {
  return block.cells.map((cell) => ({
    r: anchorR + cell.dr,
    c: anchorC + cell.dc,
    op: cell.op,
  }));
}
