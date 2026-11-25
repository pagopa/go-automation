import type { PackedPackage } from './types/PackedPackage.js';

/**
 * The scenario packages plus every published package they depend on, transitively: a
 * `@pagopa/*` dependency is installed from its tarball, never from a registry.
 *
 * @param roots - Packages the scenario installs
 * @param packed - All packed packages, by name
 * @returns The closed set, in a stable order
 */
export function closeInternalDependencies(
  roots: ReadonlyArray<string>,
  packed: ReadonlyMap<string, PackedPackage>,
): ReadonlyArray<string> {
  const closed = new Set<string>();
  const pending = [...roots];
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    if (closed.has(name)) continue;
    const entry = packed.get(name);
    if (entry === undefined) throw new Error(`${name} is not a packed published package`);
    closed.add(name);
    pending.push(...entry.internalDependencies);
  }
  return [...closed].sort();
}
