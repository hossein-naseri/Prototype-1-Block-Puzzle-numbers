import { blueprint } from '../variants/blueprint.js';
import { LEVELS } from '../config/levels.js';
import { variantConfigs } from '../config/config.js';
import { solveAllLevels } from '../core/solver.js';

const results = solveAllLevels(blueprint, LEVELS, variantConfigs.blueprint);

let allOk = true;
for (const r of results) {
  const status = !r.solvable ? 'UNSOLVABLE' : r.par === r.authoredPar ? 'ok' : `par mismatch (found ${r.par})`;
  if (!r.solvable || r.par !== r.authoredPar) allOk = false;
  console.log(`${status.padEnd(22)} ${r.id}  authored par=${r.authoredPar}`);
}

process.exit(allOk ? 0 : 1);
