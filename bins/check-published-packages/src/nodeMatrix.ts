import semver from 'semver';

import { closeInternalDependencies } from './closeInternalDependencies.js';
import type { NodeMatrixCell } from './types/NodeMatrixCell.js';
import type { PackedPackage } from './types/PackedPackage.js';
import type { SmokeScenario } from './types/SmokeScenario.js';

/** Node major the toolchain and the CI default run on (EVO-PKGPUB-OPUS-01 §10.2). */
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
 * @param scenarios - All smoke scenarios
 * @param packages - Published packages by name (only `enginesNode` and `internalDependencies` are read)
 * @returns One cell per Node version, ordered by version
 */
export function nodeMatrix(
  scenarios: ReadonlyArray<SmokeScenario>,
  packages: ReadonlyMap<string, PackedPackage>,
): ReadonlyArray<NodeMatrixCell> {
  const byNode = new Map<string, string[]>();
  for (const scenario of scenarios) {
    const ranges = closeInternalDependencies(scenario.packages, packages).map(
      (name) => packages.get(name)?.enginesNode ?? '*',
    );
    const nodes = [scenarioMinimum(ranges)];
    if (ranges.every((range) => semver.intersects(range, `${TOOLCHAIN_NODE}.x`))) nodes.push(TOOLCHAIN_NODE);
    for (const node of nodes) byNode.set(node, [...(byNode.get(node) ?? []), scenario.id]);
  }
  const cells = [...byNode].map(([node, ids]): NodeMatrixCell => ({ node, scenarios: ids.join(',') }));
  cells.sort((left, right) =>
    semver.compare(semver.coerce(left.node) ?? '0.0.0', semver.coerce(right.node) ?? '0.0.0'),
  );
  return cells;
}
