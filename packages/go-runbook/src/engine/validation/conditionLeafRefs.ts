import type { Condition } from '../types/Condition.js';

/**
 * The refs of the leaves of a condition, at any depth, in declaration order.
 * Complexity: O(C) over the nodes of the condition.
 *
 * @param condition - Condition to visit
 * @returns The refs, a ref read by two leaves once per leaf
 *
 * @example
 * ```typescript
 * [...conditionLeafRefs(all(varExists('code'), stepEvidenceMatches('query-logs', 'x')))]; // ['vars.code', 'steps.query-logs']
 * ```
 */
export function* conditionLeafRefs(condition: Condition): Generator<string, void, undefined> {
  switch (condition.type) {
    case 'compare':
    case 'pattern':
    case 'exists':
    case 'contains':
      yield condition.ref;
      return;
    case 'and':
    case 'or':
      for (const child of condition.conditions) yield* conditionLeafRefs(child);
      return;
    case 'not':
      yield* conditionLeafRefs(condition.condition);
      return;
    default: {
      const exhaustive: never = condition;
      throw new Error(`Unhandled condition type: ${JSON.stringify(exhaustive)}`);
    }
  }
}
