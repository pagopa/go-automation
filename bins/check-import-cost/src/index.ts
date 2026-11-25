import * as path from 'node:path';

import { IMPORT_BUDGETS } from './budgets.js';
import { evaluateBudget } from './evaluateBudget.js';
import { medianImportMilliseconds, moduleGraph } from './measureBudget.js';
import { resolveSpecifier } from './resolveSpecifier.js';

/** Runs per measurement: the median absorbs a slow outlier. */
const RUNS = 5;

/**
 * Multiplier of the time thresholds, from `IMPORT_COST_TIME_FACTOR` (default 1). The module-graph
 * assertions never change: they are the real guarantee.
 */
function timeFactor(): number {
  const raw = process.env['IMPORT_COST_TIME_FACTOR'];
  if (raw === undefined || raw === '') return 1;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) throw new Error('IMPORT_COST_TIME_FACTOR must be a number >= 1');
  return value;
}

async function main(): Promise<number> {
  const root = path.resolve(process.cwd());
  const factor = timeFactor();
  let failed = 0;
  for (const budget of IMPORT_BUDGETS) {
    const files = await Promise.all(budget.specifiers.map(async (spec) => resolveSpecifier(root, spec)));
    const graph = await moduleGraph(files);
    const median = medianImportMilliseconds(files, RUNS);
    const failures = evaluateBudget(budget, graph, median, factor);
    const label = budget.specifiers.join(' + ');
    console.log(
      `${failures.length === 0 ? 'ok  ' : 'FAIL'} ${label}: ${median.toFixed(0)} ms (budget ${String(budget.maxMilliseconds * factor)}), ${String(graph.thirdParty.length)} third-party packages`,
    );
    for (const failure of failures) console.log(`       ${failure}`);
    if (failures.length > 0) failed += 1;
  }
  console.log(
    `\n${String(IMPORT_BUDGETS.length - failed)}/${String(IMPORT_BUDGETS.length)} budgets met on Node ${process.versions.node}.`,
  );
  return failed === 0 ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  },
);
