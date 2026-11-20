import type { RunbookContext } from '../types/RunbookContext.js';

/**
 * Whether the evidence a step read is complete: no source of the step is saturated, unavailable, skipped or manual.
 *
 * A step that derives a value from an earlier read (a confirmed sequence, a count, an absence) uses it to publish
 * `unknown` instead of a certain answer when the read is partial. Complexity: O(C) over the coverage entries.
 *
 * @param context - Context of the step
 * @param stepId - Id of the step that read the evidence
 * @returns `true` when the context records no incomplete source for the step
 *
 * @example
 * ```typescript
 * const complete = isStepEvidenceComplete(context, 'query-application-logs');
 * ```
 */
export function isStepEvidenceComplete(context: RunbookContext, stepId: string): boolean {
  return !(context.coverage ?? []).some((entry) => entry.stepId === stepId);
}
