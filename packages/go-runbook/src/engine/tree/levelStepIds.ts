import type { TreeLevel } from '../types/TreeLevel.js';

/**
 * The step ids a level owns: its read, its scoped window steps, its per-node and after-descent steps.
 *
 * @param level - Level of the tree
 * @returns The step ids
 *
 * @example
 * ```typescript
 * levelStepIds({ target: 'api', scopedSteps: ['query-access-log'], enumerate }); // ['query-access-log']
 * ```
 */
export function levelStepIds(level: TreeLevel): ReadonlyArray<string> {
  return [
    ...(level.read !== undefined ? [level.read.id] : []),
    ...(level.scopedSteps ?? []),
    ...(level.perNode ?? []).map((descriptor) => descriptor.step.id),
    ...(level.afterDescend ?? []).map((descriptor) => descriptor.step.id),
  ];
}
