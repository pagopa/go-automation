import type { Condition } from '../types/Condition.js';
import { conditionLeafRefs } from './conditionLeafRefs.js';

const VARS_PREFIX = 'vars.';

/**
 * Collects the variables a condition reads (`vars.<name>` refs), at any depth.
 * Complexity: O(C) over the nodes of the condition.
 *
 * @param condition - Condition to inspect
 * @returns The variable names
 *
 * @example
 * ```typescript
 * collectConditionVarRefs({ type: 'exists', ref: 'vars.deliveryErrorMsg' }); // Set { 'deliveryErrorMsg' }
 * ```
 */
export function collectConditionVarRefs(condition: Condition): ReadonlySet<string> {
  const names = new Set<string>();
  for (const ref of conditionLeafRefs(condition)) {
    if (ref.startsWith(VARS_PREFIX)) names.add(ref.slice(VARS_PREFIX.length));
  }
  return names;
}
