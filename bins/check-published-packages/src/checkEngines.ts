import semver from 'semver';

import { InstalledGraph } from './InstalledGraph.js';
import type { PackedPackage } from './types/PackedPackage.js';

/**
 * Checks that the `engines.node` range of each published package is contained in the range of every
 * package in **its own** installed dependency closure: internal `@pagopa/*` dependencies and installed
 * peers included. The closure follows the dependency direction,
 * so a foundation package is never checked against the narrower range of its consumers.
 *
 * @param directory - Consumer project
 * @param direct - Published packages the consumer depends on directly
 * @param published - All published packages of the scenario
 * @returns One message per dependency whose range is narrower than the declared one
 */
export async function checkEngines(
  directory: string,
  direct: ReadonlyArray<string>,
  published: ReadonlyArray<PackedPackage>,
): Promise<ReadonlyArray<string>> {
  const graph = new InstalledGraph();
  const publishedNames = new Set(published.map((entry) => entry.name));
  const checked = new Map<string, string>();
  const failures: string[] = [];
  for (const name of direct) {
    const start = await graph.resolve(directory, name);
    if (start === undefined) {
      failures.push(`${name} is not installed in the consumer project`);
      continue;
    }
    for (const node of await graph.closure(start)) {
      if (!publishedNames.has(node.name) || checked.has(node.directory)) continue;
      checked.set(node.directory, node.name);
      const dependencies = (await graph.closure(node.directory)).filter((other) => other.directory !== node.directory);
      failures.push(...engineViolations({ name: node.name, enginesNode: node.range ?? '' }, dependencies));
    }
  }
  const reachedNames = new Set(checked.values());
  for (const entry of published) {
    if (!reachedNames.has(entry.name)) failures.push(`${entry.name} is not reachable from the installed packages`);
  }
  return failures;
}

/**
 * Pure part of {@link checkEngines}: the declared range of one package against its dependency closure.
 *
 * @param entry - Published package with its declared range
 * @param dependencies - Installed packages of its closure, with their range when they declare one
 * @returns One message per violation
 */
export function engineViolations(
  entry: Readonly<{ name: string; enginesNode: string }>,
  dependencies: ReadonlyArray<Readonly<{ id: string; range?: string }>>,
): ReadonlyArray<string> {
  if (semver.validRange(entry.enginesNode) === null || entry.enginesNode === '') {
    return [`${entry.name} declares an invalid engines.node "${entry.enginesNode}"`];
  }
  const failures: string[] = [];
  for (const dependency of dependencies) {
    if (dependency.range === undefined || semver.validRange(dependency.range) === null) continue;
    if (!semver.subset(entry.enginesNode, dependency.range)) {
      failures.push(
        `${entry.name} declares node ${entry.enginesNode}, but ${dependency.id} requires ${dependency.range}`,
      );
    }
  }
  return failures;
}
