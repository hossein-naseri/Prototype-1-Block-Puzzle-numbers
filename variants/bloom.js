import { noLegalPlacements } from '../core/legality.js';
import { absoluteCells } from '../core/blocks.js';
import { cloneBoard, cellAt, forEachCell, inBounds } from '../core/board.js';

const NEIGHBORS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

// Finds every orthogonally-connected group of 2+ same-value, non-zero tiles.
// Callers filter by config.minGroupSize.
function findGroups(board) {
  const seen = new Set();
  const groups = [];
  forEachCell(board, (r, c, cell) => {
    const key = `${r},${c}`;
    if (seen.has(key) || cell.value === 0) return;
    const value = cell.value;
    const stack = [[r, c]];
    const group = [];
    seen.add(key);
    while (stack.length) {
      const [cr, cc] = stack.pop();
      group.push({ r: cr, c: cc });
      for (const [dr, dc] of NEIGHBORS) {
        const nr = cr + dr;
        const nc = cc + dc;
        const nkey = `${nr},${nc}`;
        if (!inBounds(board.size, nr, nc) || seen.has(nkey)) continue;
        if (cellAt(board, nr, nc).value === value) {
          seen.add(nkey);
          stack.push([nr, nc]);
        }
      }
    }
    groups.push({ value, cells: group });
  });
  return groups;
}

// A "most recently modified" tile in a group is: one the player's own
// placement just touched (first pass), or the survivor tile from the prior
// cascade pass (subsequent passes). Top-left tie-break when several
// candidates in the same group qualify.
function pickWinner(group, recentSet) {
  const candidates = group.filter((cell) => recentSet.has(`${cell.r},${cell.c}`));
  const pool = candidates.length ? candidates : group;
  return pool.reduce((best, cell) => {
    if (!best) return cell;
    return cell.r < best.r || (cell.r === best.r && cell.c < best.c) ? cell : best;
  }, null);
}

export const bloom = {
  name: 'bloom',

  onPlacementResolved(board, placement, variantState, config) {
    const minGroupSize = config.minGroupSize ?? 3;
    const working = cloneBoard(board);
    let recentSet = new Set(
      placement.changedCells.filter((c) => c.prevValue !== c.value).map((c) => `${c.r},${c.c}`)
    );
    if (recentSet.size === 0) {
      recentSet = new Set(placement.changedCells.map((c) => `${c.r},${c.c}`));
    }

    let scoreDelta = 0;
    let chain = 0;
    const events = [];

    for (;;) {
      const groups = findGroups(working).filter((g) => g.cells.length >= minGroupSize);
      if (groups.length === 0) break;
      chain += 1;
      const nextRecent = new Set();

      for (const group of groups) {
        const winner = pickWinner(group.cells, recentSet);
        const newValue = group.value + 1;
        for (const cell of group.cells) {
          const boardCell = cellAt(working, cell.r, cell.c);
          if (cell.r === winner.r && cell.c === winner.c) {
            boardCell.value = newValue;
            nextRecent.add(`${cell.r},${cell.c}`);
          } else {
            boardCell.value = 0;
          }
        }
        scoreDelta += config.baseScorePerTier(group.value, group.cells.length) * chain;
        events.push({ type: 'bloom', groupSize: group.cells.length, value: group.value, chain, winner });
      }

      recentSet = nextRecent;
    }

    const mutations = [];
    forEachCell(board, (r, c, cell) => {
      const newValue = cellAt(working, r, c).value;
      if (newValue !== cell.value) mutations.push({ r, c, patch: { value: newValue } });
    });

    return { mutations, scoreDelta, events };
  },

  isGameOver(board, hand) {
    return noLegalPlacements(board, hand, absoluteCells);
  },

  getHudState() {
    return {};
  },
};
