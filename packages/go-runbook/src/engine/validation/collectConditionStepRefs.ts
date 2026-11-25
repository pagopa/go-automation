import type { Condition } from '../types/Condition.js';
import { parseStepRef } from '../context/parseStepRef.js';
import { conditionLeafRefs } from './conditionLeafRefs.js';

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
  for (const ref of conditionLeafRefs(condition)) {
    const stepRef = parseStepRef(ref);
    if (stepRef !== undefined) refs.add(stepRef.stepId);
  }
  return refs;
}
