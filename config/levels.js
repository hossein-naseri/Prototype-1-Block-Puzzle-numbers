import { createBlock } from '../core/blocks.js';

// Blueprint levels: fixed board, fixed target, fixed hand sequence (no
// randomness at all - the level is a designed object with a known
// solution). `par` is the number of moves in the intended solution;
// scripts/solve-levels.mjs brute-forces every level to confirm it's
// reachable and to report the true optimal par.
//
// A hand is exactly 3 block specs: { shapeId, ops: [op, op, op] }. Every
// block (including ones not needed for the intended solution) still needs
// >=1 non-'none' op, same as any generated block. Because a level's win
// check runs after every single placement, a "filler" block that isn't
// part of the intended solution is only ever safe to include in the LAST
// hand a level needs - once the winning move lands, remaining hand blocks
// are never forced into play. Earlier hands must be fully consumable
// without a filler accidentally breaking an already-correct target cell,
// so every block in a non-final hand is part of the intended solution.

function hand(...specs) {
  return specs.map((s) => ({ shapeId: s.shapeId, ops: s.ops }));
}

function grid(size, fill, overrides) {
  const cells = new Array(size * size).fill(fill);
  for (const [r, c, v] of overrides || []) cells[r * size + c] = v;
  return cells;
}

export const LEVELS = [
  {
    id: 'l1-diagonal',
    name: '1. Diagonal',
    boardSize: 3,
    startBoard: grid(3, 0),
    targetBoard: grid(3, 0, [[0, 0, 1], [1, 1, 1], [2, 2, 1]]),
    par: 3,
    handSequence: [
      hand(
        { shapeId: 'I_H', ops: ['plus1', 'none', 'none'] }, // (0,0) -> 1
        { shapeId: 'SCATTER_WIDE', ops: ['none', 'none', 'plus1'] }, // (1,1) -> 1
        { shapeId: 'DIAG_DOWN', ops: ['none', 'none', 'plus1'] } // (2,2) -> 1
      ),
    ],
  },
  {
    id: 'l2-two-taps',
    name: '2. Two Taps',
    boardSize: 3,
    startBoard: grid(3, 0),
    targetBoard: grid(3, 0, [[0, 0, 2], [1, 1, 1]]),
    par: 3,
    handSequence: [
      hand(
        { shapeId: 'I_H', ops: ['plus1', 'none', 'none'] }, // (0,0) 0->1
        { shapeId: 'I_H', ops: ['plus1', 'none', 'none'] }, // (0,0) 1->2
        { shapeId: 'SCATTER_WIDE', ops: ['none', 'none', 'plus1'] } // (1,1) -> 1
      ),
    ],
  },
  {
    id: 'l3-double-up',
    name: '3. Double Up',
    boardSize: 3,
    startBoard: grid(3, 0, [[1, 1, 3]]),
    targetBoard: grid(3, 0, [[1, 1, 6]]),
    par: 1,
    handSequence: [
      hand(
        { shapeId: 'SCATTER_WIDE', ops: ['none', 'none', 'x2'] }, // (1,1) 3->6, wins immediately
        { shapeId: 'I_H', ops: ['plus1', 'none', 'none'] }, // filler, never forced
        { shapeId: 'I_V', ops: ['none', 'minus1', 'none'] } // filler, never forced
      ),
    ],
  },
  {
    id: 'l4-half-measures',
    name: '4. Half Measures',
    boardSize: 3,
    startBoard: grid(3, 0, [[0, 0, 8], [2, 2, 5]]),
    targetBoard: grid(3, 0, [[0, 0, 2], [2, 2, 4]]),
    par: 3,
    handSequence: [
      hand(
        { shapeId: 'I_H', ops: ['div2', 'none', 'none'] }, // (0,0) 8->4
        { shapeId: 'I_H', ops: ['div2', 'none', 'none'] }, // (0,0) 4->2
        { shapeId: 'I_V', ops: ['none', 'none', 'minus1'] } // (2,2) 5->4, anchored to land on col 2
      ),
    ],
  },
  {
    id: 'l5-four-corners',
    name: '5. Four Corners',
    boardSize: 4,
    startBoard: grid(4, 0),
    targetBoard: grid(4, 0, [[0, 0, 1], [0, 3, 1], [3, 0, 1], [3, 3, 1]]),
    par: 4,
    handSequence: [
      hand(
        { shapeId: 'I_H', ops: ['plus1', 'none', 'none'] }, // (0,0) -> 1
        { shapeId: 'I_H', ops: ['none', 'none', 'plus1'] }, // (0,3) -> 1
        { shapeId: 'I_V', ops: ['none', 'none', 'plus1'] } // (3,0) -> 1
      ),
      hand(
        { shapeId: 'I_V', ops: ['none', 'none', 'plus1'] }, // (3,3) -> 1, wins
        { shapeId: 'L1', ops: ['plus1', 'none', 'none'] }, // filler, never forced
        { shapeId: 'L2', ops: ['none', 'plus1', 'none'] } // filler, never forced
      ),
    ],
  },
  {
    id: 'l6-cross-cut',
    name: '6. Cross Cut',
    boardSize: 4,
    startBoard: grid(4, 0, [[1, 1, 4], [1, 2, 4], [2, 1, 4], [2, 2, 4]]),
    targetBoard: grid(4, 0, [[1, 1, 2], [1, 2, 2], [2, 1, 2], [2, 2, 2]]),
    par: 2,
    handSequence: [
      hand(
        { shapeId: 'I_H', ops: ['div2', 'div2', 'none'] }, // (1,1)&(1,2) 4->2, wins on move 2
        { shapeId: 'I_H', ops: ['div2', 'div2', 'none'] }, // (2,1)&(2,2) 4->2
        { shapeId: 'I_V', ops: ['plus1', 'none', 'none'] } // filler, never forced
      ),
    ],
  },
  {
    id: 'l7-the-descent',
    name: '7. The Descent',
    boardSize: 4,
    startBoard: grid(4, 0, [[0, 0, 5], [0, 1, 5], [0, 2, 5]]),
    targetBoard: grid(4, 0, [[0, 0, 2], [0, 1, 2], [0, 2, 2]]),
    par: 3,
    handSequence: [
      hand(
        { shapeId: 'I_H', ops: ['minus1', 'minus1', 'minus1'] },
        { shapeId: 'I_H', ops: ['minus1', 'minus1', 'minus1'] },
        { shapeId: 'I_H', ops: ['minus1', 'minus1', 'minus1'] }
      ),
    ],
  },
  {
    id: 'l8-the-workshop',
    name: '8. The Workshop',
    boardSize: 4,
    startBoard: grid(4, 0, [[0, 0, 3], [3, 3, 6]]),
    targetBoard: grid(4, 0, [[0, 0, 8], [1, 1, 1], [3, 3, 3]]),
    par: 4,
    handSequence: [
      hand(
        { shapeId: 'I_H', ops: ['plus1', 'none', 'none'] }, // (0,0) 3->4, must go before the x2 below
        { shapeId: 'I_V', ops: ['x2', 'none', 'none'] }, // (0,0) 4->8
        { shapeId: 'SCATTER_WIDE', ops: ['none', 'none', 'plus1'] } // (1,1) -> 1
      ),
      hand(
        { shapeId: 'I_V', ops: ['none', 'none', 'div2'] }, // (3,3) 6->3, wins
        { shapeId: 'L1', ops: ['none', 'none', 'minus1'] }, // filler, never forced
        { shapeId: 'L2', ops: ['none', 'plus1', 'none'] } // filler, never forced
      ),
    ],
  },
];

export function buildHand(specs) {
  return specs.map((spec) => createBlock(spec.shapeId, spec.ops));
}
