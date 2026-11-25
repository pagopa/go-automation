import semver from 'semver';

import { closeInternalDependencies } from './closeInternalDependencies.js';
import type { NodeMatrixCell } from './types/NodeMatrixCell.js';
import type { PackedPackage } from './types/PackedPackage.js';
import type { SmokeScenario } from './types/SmokeScenario.js';

/** Node major the toolchain and the CI default run on. */
const TOOLCHAIN_NODE = '24';

/**
 * The lowest Node version every range accepts: the highest of their minima, checked against all of them.
 *
 * @param ranges - `engines.node` of the packages one scenario installs
 * @returns Exact version
 * @throws Error when a range is invalid, or no single minimum satisfies all the ranges
 */
export function scenarioMinimum(ranges: ReadonlyArray<string>): string {
  let highest: semver.SemVer | undefined;
  for (const range of ranges) {
    const minimum = semver.validRange(range) === null ? null : semver.minVersion(range);
    if (minimum === null) throw new Error(`engines.node "${range}" has no minimum version`);
    if (highest === undefined || semver.gt(minimum, highest)) highest = minimum;
  }
  if (highest === undefined) throw new Error('a scenario installs no published package');
  const version = highest.version;
  const rejecting = ranges.filter((range) => !semver.satisfies(version, range));
  if (rejecting.length > 0) throw new Error(`no common minimum Node for ${ranges.join(' / ')} (${version} fails)`);
  return version;
}

/**
 * The smoke matrix: each scenario runs on the minimum Node its installed packages declare (its own
 * dependency closure, not the whole workspace) and on the toolchain major when all of them accept it.
 * Derived from the manifests, so raising or lowering one package's minimum moves only its scenarios.
 *
 * The scenarios of each Node version are split into `shards` consecutive groups whose sizes differ by at most one,
 * so the CI runs them on parallel runners; a version with fewer scenarios than shards gets one shard per scenario.
 *
 * @param scenarios - All smoke scenarios
 * @param packages - Published packages by name (only `enginesNode` and `internalDependencies` are read)
 * @param shards - Shards per Node version (at least 1)
 * @returns One cell per Node version and shard, ordered by version then shard
 * @throws Error when `shards` is not a positive integer
 */
export function nodeMatrix(
  scenarios: ReadonlyArray<SmokeScenario>,
  packages: ReadonlyMap<string, PackedPackage>,
  shards = 1,
): ReadonlyArray<NodeMatrixCell> {
  if (!Number.isInteger(shards) || shards < 1)
    throw new Error(`shards must be a positive integer, not ${String(shards)}`);
  const byNode = new Map<string, string[]>();
  for (const scenario of scenarios) {
    const ranges = closeInternalDependencies(scenario.packages, packages).map(
      (name) => packages.get(name)?.enginesNode ?? '*',
    );
    const nodes = [scenarioMinimum(ranges)];
    if (ranges.every((range) => semver.intersects(range, `${TOOLCHAIN_NODE}.x`))) nodes.push(TOOLCHAIN_NODE);
    for (const node of nodes) byNode.set(node, [...(byNode.get(node) ?? []), scenario.id]);
  }
  const nodes = [...byNode.keys()].sort((left, right) =>
    semver.compare(semver.coerce(left) ?? '0.0.0', semver.coerce(right) ?? '0.0.0'),
  );
  return nodes.flatMap((node) => {
    const groups = splitEvenly(byNode.get(node) ?? [], shards);
    return groups.map((ids, index): NodeMatrixCell => ({
      node,
      shard: `${String(index + 1)}/${String(groups.length)}`,
      scenarios: ids.join(','),
    }));
  });
}

/**
 * Splits a list into at most `parts` consecutive, non-empty groups whose sizes differ by at most one.
 *
 * @param items - Items to split, in order
 * @param parts - Wanted number of groups
 * @returns The groups, in order
 */
function splitEvenly(items: ReadonlyArray<string>, parts: number): ReadonlyArray<ReadonlyArray<string>> {
  if (items.length === 0) return [];
  const count = Math.min(parts, items.length);
  const base = Math.floor(items.length / count);
  const larger = items.length % count;
  const groups: ReadonlyArray<string>[] = [];
  let start = 0;
  for (let index = 0; index < count; index++) {
    const size = base + (index < larger ? 1 : 0);
    groups.push(items.slice(start, start + size));
    start += size;
  }
  return groups;
}
