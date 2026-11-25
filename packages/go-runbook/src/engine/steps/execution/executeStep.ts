import type { RunbookContext } from '../../types/RunbookContext.js';
import { failedResultUnlessAborted } from '../../context/failedResultUnlessAborted.js';
import type { StepResult } from '../../types/StepResult.js';

type StepExecutionHandler<T> = () => Promise<StepResult<T>>;

/**
 * Wraps an async step execution with consistent error handling.
 * Catches errors and returns a failed `StepResult` with a formatted error message; when the execution was cancelled
 * the error is thrown again, so that the cancellation ends the run instead of becoming a failed step.
 *
 * @param context - Context of the step, whose abort signal tells a cancellation from a failure
 * @param label - Human-readable label prefixed to the error message (e.g. "CloudWatch Logs query")
 * @param fn - Async function that performs the step logic
 * @returns The step result from `fn`, or a failed result if an error is thrown
 * @throws The error of `fn` when the execution was cancelled
 *
 * @example
 * ```typescript
 * async execute(context: RunbookContext): Promise<StepResult<Data>> {
 *   return executeStep(context, 'CloudWatch Logs query', async () => {
 *     const results = await context.services.cloudWatchLogs.query(...);
 *     return { success: true, output: results };
 *   });
 * }
 * ```
 */
export async function executeStep<T>(
  context: Pick<RunbookContext, 'signal'>,
  label: string,
  fn: StepExecutionHandler<T>,
): Promise<StepResult<T>> {
  try {
    return await fn();
  } catch (error: unknown) {
    const failure = failedResultUnlessAborted(context, error);
    return { success: false, error: `${label} failed: ${failure.error}` };
  }
}
