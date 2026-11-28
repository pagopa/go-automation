import type { ErrorTreeDefinition } from '../types/ErrorTreeDefinition.js';
import type { KnownError } from '../types/KnownError.js';
import { collectConditionStepRefs } from '../validation/collectConditionStepRefs.js';
import { collectConditionVarRefs } from '../validation/collectConditionVarRefs.js';
import { isDescentVar } from './descentVarNames.js';
import { levelStepIds } from './levelStepIds.js';

/**
 * The levels of the error tree each known error is evaluated on.
 *
 * A case belongs to the levels whose steps and variables its condition reads: a step belongs to the level that
 * reads, scopes or runs it (any other step of the window to the root level); a variable to the level that writes it
 * (`ownsVar`). The variables a descent publishes on its parent (`<prefix>LookupState`, …) and the outcome of the
 * branch are read where they are published, and do not decide the level. When the condition reads more levels than
 * the root (an `or` of two services reachable by different routes), the case is evaluated on each of them: a node
 * sees only its own rows, so the steps of another level are absent. A case that reads nothing of a level below the
 * root belongs to the root level.
 *
 * Complexity: O(K · R · L) over the cases, their refs and the levels.
 *
 * @param knownErrors - Cases of the runbook
 * @param tree - Levels of the runbook
 * @returns The targets of the levels of each case, by case id
 *
 * @example
 * ```typescript
 * computeCaseLevels(runbook.knownErrors, tree).get('delivery-npe'); // Set { 'pn-delivery' }
 * ```
 */
export function computeCaseLevels(
  knownErrors: ReadonlyArray<KnownError>,
  tree: ErrorTreeDefinition,
): ReadonlyMap<string, ReadonlySet<string>> {
  const stepLevel = new Map<string, string>();
  for (const level of tree.levels) {
    for (const stepId of levelStepIds(level)) stepLevel.set(stepId, level.target);
  }

  const result = new Map<string, ReadonlySet<string>>();
  for (const knownError of knownErrors) {
    const levels = new Set<string>();
    for (const stepId of collectConditionStepRefs(knownError.condition)) {
      // A step of the window, or of the root level, is read on the root nodes.
      levels.add(stepLevel.get(stepId) ?? tree.root.target);
    }
    for (const name of collectConditionVarRefs(knownError.condition)) {
      for (const level of tree.levels) {
        if (level.varPrefix !== undefined && isDescentVar(name, level.varPrefix)) continue;
        if (level.ownsVar?.(name) === true) levels.add(level.target);
      }
    }
    result.set(knownError.code, levels.size > 0 ? levels : new Set([tree.root.target]));
  }
  return result;
}
