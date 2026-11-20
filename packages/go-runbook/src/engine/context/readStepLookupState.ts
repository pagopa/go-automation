import type { RunbookContext } from '../types/RunbookContext.js';
import type { StepLookupState } from '../types/StepLookupState.js';

/** Precedence of the incomplete states: a read that was not even attempted says the least. */
const PRECEDENCE: ReadonlyArray<Exclude<StepLookupState, 'queried'>> = ['skipped', 'unavailable', 'saturated'];

/**
 * The state of the read of a step, from the coverage recorded in the context: `queried` when the step declared no
 * incomplete source, otherwise the most severe reason (`skipped`, then `unavailable`, then `saturated`; a manual
 * correlation counts as `unavailable`). Complexity: O(C) over the coverage entries.
 *
 * @param context - Context of the step that interprets the read
 * @param stepId - Id of the step that read
 * @returns The state of the read
 *
 * @example
 * ```typescript
 * const state = readStepLookupState(context, 'query-pn-delivery'); // 'queried' | 'saturated' | …
 * ```
 */
export function readStepLookupState(context: RunbookContext, stepId: string): StepLookupState {
  const reasons = new Set(
    (context.coverage ?? [])
      .filter((entry) => entry.stepId === stepId)
      .map((entry) => (entry.reason === undefined || entry.reason === 'manual' ? 'unavailable' : entry.reason)),
  );
  return PRECEDENCE.find((state) => reasons.has(state)) ?? 'queried';
}
