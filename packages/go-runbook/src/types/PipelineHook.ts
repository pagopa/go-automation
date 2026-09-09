import type { StepDescriptor } from './StepDescriptor.js';

/**
 * A custom step spliced into a toolkit's canonical pipeline at a named point.
 *
 * Toolkit builders generate their pipeline from configuration, so a runbook has
 * no list to insert a step into. A hook says *where* the step goes, instead of
 * inventing a config field — and a new concept — for every position.
 *
 * Each toolkit declares its own anchor vocabulary: the pipelines differ, so a
 * shared set of positions would be a lie.
 *
 * @typeParam TAnchor - Anchor vocabulary of the toolkit
 *
 * @example
 * ```typescript
 * hooks: [{ at: 'after-entry-analysis', step: new VerifyLambdaStep({ … }), silent: true }]
 * ```
 */
export interface PipelineHook<TAnchor extends string> extends StepDescriptor {
  /** Point of the canonical pipeline this step is spliced into. */
  readonly at: TAnchor;
}
