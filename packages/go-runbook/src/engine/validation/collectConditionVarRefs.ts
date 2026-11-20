import type { Condition } from '../types/Condition.js';

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
  collect(condition, names);
  return names;
}

function collect(condition: Condition, into: Set<string>): void {
  switch (condition.type) {
    case 'compare':
    case 'pattern':
    case 'exists':
    case 'contains': {
      if (condition.ref.startsWith(VARS_PREFIX)) into.add(condition.ref.slice(VARS_PREFIX.length));
      return;
    }
    case 'and':
    case 'or': {
      for (const child of condition.conditions) collect(child, into);
      return;
    }
    case 'not': {
      collect(condition.condition, into);
      return;
    }
    default: {
      const exhaustive: never = condition;
      throw new Error(`Unhandled condition type: ${JSON.stringify(exhaustive)}`);
    }
  }
}
