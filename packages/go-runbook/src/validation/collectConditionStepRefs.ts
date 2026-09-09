import type { Condition } from '../types/Condition.js';

const STEPS_PREFIX = 'steps.';

/**
 * Collects the step ids a condition references through `steps.<id>…` refs.
 *
 * Walks the whole condition tree, so a step cited deep inside an
 * `and`/`or`/`not` is found. Refs to `vars.` and `params.` are ignored:
 * only step refs can point at a step the pipeline never wired.
 *
 * @param condition - Condition tree to walk
 * @returns The distinct step ids referenced, empty when there are none
 *
 * @example
 * ```typescript
 * collectConditionStepRefs({ type: 'contains', ref: 'steps.query-foo', regex: 'x' });
 * // Set { 'query-foo' }
 * ```
 */
export function collectConditionStepRefs(condition: Condition): ReadonlySet<string> {
  const refs = new Set<string>();
  collect(condition, refs);
  return refs;
}

function collect(condition: Condition, into: Set<string>): void {
  switch (condition.type) {
    case 'compare':
    case 'pattern':
    case 'exists':
    case 'contains': {
      if (!condition.ref.startsWith(STEPS_PREFIX)) return;
      const stepId = condition.ref.slice(STEPS_PREFIX.length).split('.')[0] ?? '';
      if (stepId !== '') into.add(stepId);
      return;
    }
    case 'and':
    case 'or': {
      for (const child of condition.conditions) {
        collect(child, into);
      }
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
