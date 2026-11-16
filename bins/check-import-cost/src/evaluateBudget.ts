import type { ImportBudget } from './types/ImportBudget.js';

/** What the module graph of a budget contains. */
export interface ModuleGraph {
  /** Third-party package names (workspace packages excluded). */
  readonly thirdParty: ReadonlyArray<string>;
  /** Whether a native `.node` module is in the graph. */
  readonly hasNativeModule: boolean;
}

/**
 * Checks a measured graph and time against a budget.
 *
 * @param budget - The budget
 * @param graph - Packages in the module graph
 * @param medianMilliseconds - Median cold import time
 * @param timeFactor - Multiplier of the time thresholds (1 by default; raised only for slower runners)
 * @returns One message per violation
 */
export function evaluateBudget(
  budget: ImportBudget,
  graph: ModuleGraph,
  medianMilliseconds: number,
  timeFactor: number,
): ReadonlyArray<string> {
  const label = budget.specifiers.join(' + ');
  const failures: string[] = [];
  const limit = budget.maxMilliseconds * timeFactor;
  if (medianMilliseconds >= limit) {
    failures.push(`${label}: ${medianMilliseconds.toFixed(0)} ms, budget < ${limit.toFixed(0)} ms`);
  }
  if (budget.allowedThirdParty !== undefined) {
    const allowed = new Set(budget.allowedThirdParty);
    const extra = graph.thirdParty.filter((name) => !allowed.has(name));
    if (extra.length > 0) failures.push(`${label}: third-party packages not allowed: ${extra.join(', ')}`);
  }
  for (const forbidden of budget.forbidden ?? []) {
    const hits = graph.thirdParty.filter((name) =>
      forbidden.endsWith('/') ? name.startsWith(forbidden) : name === forbidden,
    );
    if (hits.length > 0) failures.push(`${label}: forbidden packages in the graph: ${hits.join(', ')}`);
  }
  if (budget.onlySdkClients !== undefined) {
    const allowed = new Set(budget.onlySdkClients);
    const clients = graph.thirdParty.filter((name) => name.startsWith('@aws-sdk/client-') && !allowed.has(name));
    if (clients.length > 0) failures.push(`${label}: SDK clients not allowed: ${clients.join(', ')}`);
  }
  if (budget.noNativeModules === true && graph.hasNativeModule)
    failures.push(`${label}: native .node module in the graph`);
  return failures;
}

/**
 * Package name of a module path inside `node_modules` (the innermost one), or `undefined` for a
 * workspace file.
 *
 * @param input - Path of a bundled module
 * @returns The package name
 */
export function packageOfInput(input: string): string | undefined {
  const marker = 'node_modules/';
  const index = input.lastIndexOf(marker);
  if (index < 0) return undefined;
  const rest = input.slice(index + marker.length).split('/');
  const [first, second] = rest;
  if (first === undefined) return undefined;
  return first.startsWith('@') && second !== undefined ? `${first}/${second}` : first;
}
