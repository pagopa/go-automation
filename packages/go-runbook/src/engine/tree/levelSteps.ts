import type { StepDescriptor } from '../types/StepDescriptor.js';
import type { TreeLevel } from '../types/TreeLevel.js';

/**
 * The steps a level runs: its per-node steps, then its after-descent steps.
 *
 * @param level - Level of the tree
 * @returns The descriptors, in that order
 *
 * @example
 * ```typescript
 * levelSteps(tree.root).map((descriptor) => descriptor.step.id);
 * ```
 */
export function levelSteps(level: TreeLevel): ReadonlyArray<StepDescriptor> {
  return [...(level.perNode ?? []), ...(level.afterDescend ?? [])];
}
