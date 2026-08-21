import { createGame, placeBlock } from './engine.js';

// Brute-force, depth-limited BFS over placements for a Blueprint level.
// Blueprint's hands are fully scripted (no RNG involved), so the seed is
// irrelevant - the search space is just (board state, which scripted hand
// slot we're on). Used to validate that a hand-authored level is solvable
// and to find its true optimal par (which may differ from the level's
// authored `par` if a shortcut exists).
//
// Runnable from a browser console once the module is loaded:
//   import { solveLevel } from './core/solver.js';
//   import { blueprint } from './variants/blueprint.js';
//   import { LEVELS } from './config/levels.js';
//   import { variantConfigs } from './config/config.js';
//   solveLevel(blueprint, LEVELS[0], variantConfigs.blueprint);
// Or from Node: `node scripts/solve-levels.mjs`.
export function solveLevel(blueprintVariant, level, baseConfig, maxDepth) {
  const config = { ...baseConfig, level };
  const depthLimit = maxDepth ?? (level.par ?? 6) + 3;
  const start = createGame(blueprintVariant, config, 1);

  function boardKey(board) {
    return board.cells.map((c) => c.value).join(',');
  }

  function handKey(hand) {
    return hand
      .map((b) => `${b.shapeId}:${b.cells.map((c) => c.op).join('')}`)
      .sort()
      .join('|');
  }

  function stateKey(state) {
    return `${boardKey(state.board)}#${state.variantState.handIndex}#${handKey(state.hand)}`;
  }

  if (blueprintVariant.checkWin(start.board, start.variantState, config)) {
    return { solvable: true, par: 0, moves: [] };
  }

  const visited = new Set([stateKey(start)]);
  let frontier = [{ state: start, path: [] }];

  for (let depth = 0; depth < depthLimit && frontier.length > 0; depth++) {
    const nextFrontier = [];
    for (const { state, path } of frontier) {
      if (state.gameOver) continue;
      for (const block of state.hand) {
        for (let r = 0; r < state.board.size; r++) {
          for (let c = 0; c < state.board.size; c++) {
            const result = placeBlock(blueprintVariant, state, block.id, r, c);
            if (!result.ok) continue;
            const move = { shapeId: block.shapeId, ops: block.cells.map((cell) => cell.op), r, c };
            const newPath = [...path, move];
            if (blueprintVariant.checkWin(result.state.board, result.state.variantState, config)) {
              return { solvable: true, par: newPath.length, moves: newPath };
            }
            const key = stateKey(result.state);
            if (visited.has(key)) continue;
            visited.add(key);
            nextFrontier.push({ state: result.state, path: newPath });
          }
        }
      }
    }
    frontier = nextFrontier;
  }

  return { solvable: false, par: null, moves: null, exploredDepth: depthLimit };
}

export function solveAllLevels(blueprintVariant, levels, baseConfig) {
  return levels.map((level) => ({
    id: level.id,
    name: level.name,
    authoredPar: level.par,
    ...solveLevel(blueprintVariant, level, baseConfig),
  }));
}
