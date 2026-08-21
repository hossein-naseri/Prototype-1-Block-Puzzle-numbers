// All exactly-3-cell block shapes, as relative {dr, dc} offsets normalized to
// a minimal (0,0) bounding origin. No rotation happens at runtime (v1), so
// every orientation the player should see must be listed explicitly here.
export const SHAPES = [
  { id: 'I_H', cells: [[0, 0], [0, 1], [0, 2]] },
  { id: 'I_V', cells: [[0, 0], [1, 0], [2, 0]] },
  { id: 'L1', cells: [[0, 0], [0, 1], [1, 0]] },
  { id: 'L2', cells: [[0, 0], [0, 1], [1, 1]] },
  { id: 'L3', cells: [[0, 0], [1, 0], [1, 1]] },
  { id: 'L4', cells: [[0, 1], [1, 0], [1, 1]] },
  { id: 'DIAG_DOWN', cells: [[0, 0], [1, 1], [2, 2]] },
  { id: 'DIAG_UP', cells: [[0, 2], [1, 1], [2, 0]] },
  { id: 'SCATTER_WIDE', cells: [[0, 0], [0, 2], [1, 1]] },
  { id: 'SCATTER_TALL', cells: [[0, 1], [1, 0], [2, 1]] },
];

export function shapeBounds(shape) {
  const rows = shape.cells.map((c) => c[0]);
  const cols = shape.cells.map((c) => c[1]);
  return {
    height: Math.max(...rows) + 1,
    width: Math.max(...cols) + 1,
  };
}
