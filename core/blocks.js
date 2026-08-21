import { SHAPES } from './shapes.js';

let uid = 0;
function nextId() {
  uid += 1;
  return `blk_${uid}`;
}

// Draw one operator per cell from the weighted config, re-rolling until at
// least one cell in the block is a non-'none' operator (every block must
// carry at least one operator).
export function generateBlock(rng, config) {
  const shape = rng.pick(SHAPES);
  let ops;
  do {
    ops = shape.cells.map(() => rng.weighted(config.operatorWeights));
  } while (ops.every((op) => op === 'none'));
  const cells = shape.cells.map(([dr, dc], i) => ({ dr, dc, op: ops[i] }));
  return { id: nextId(), shapeId: shape.id, cells };
}

// Build a block explicitly (no RNG) - used by authored Blueprint levels.
export function createBlock(shapeId, ops) {
  const shape = SHAPES.find((s) => s.id === shapeId);
  const cells = shape.cells.map(([dr, dc], i) => ({ dr, dc, op: ops[i] }));
  return { id: nextId(), shapeId, cells };
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
