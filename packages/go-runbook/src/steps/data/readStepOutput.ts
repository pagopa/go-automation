import type { RunbookContext } from '../../types/RunbookContext.js';
import type { StepResult } from '../../types/StepResult.js';

/**
 * Outcome of {@link readStepOutput}. Either yields the raw step output or
 * a `StepResult` carrying the canonical "not found" failure that callers
 * can return directly from their `execute()` method.
 */
export type ReadStepOutputResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: StepResult<never> };

/**
 * Reads a previous step's output from the context with a unified
 * "not found" error message.
 *
 * Replaces the ad-hoc `if (rawOutput === undefined) return { success: false, error: ... }`
 * block repeated across step implementations (data/transform/apigw steps),
 * normalising the error wording so consumers can rely on a single match.
 *
 * @param context - Current runbook context.
 * @param fromStep - Step ID whose output we want to consume.
 * @returns `{ ok: true, value }` with the raw output, or `{ ok: false, failure }`
 *          where `failure` is a `StepResult<never>` to return from the caller.
 *
 * @example
 * ```typescript
 * const upstream = readStepOutput<ReadonlyArray<Row>>(context, this.fromStep);
 * if (!upstream.ok) return upstream.failure;
 * const rows = upstream.value;
 * ```
 */
export function readStepOutput<T>(context: RunbookContext, fromStep: string): ReadStepOutputResult<T> {
  const raw = context.stepResults.get(fromStep);
  if (raw === undefined) {
    return {
      ok: false,
      failure: { success: false, error: `Step output not found: "${fromStep}"` },
    };
  }
  return { ok: true, value: raw as T };
}
