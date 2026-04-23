import type { StepResult } from '../../types/StepResult.js';

type StepExecutionHandler<T> = () => Promise<StepResult<T>>;

/**
 * Wraps an async step execution with consistent error handling.
 * Catches errors and returns a failed `StepResult` with a formatted error message.
 *
 * @param label - Human-readable label prefixed to the error message (e.g. "CloudWatch Logs query")
 * @param fn - Async function that performs the step logic
 * @returns The step result from `fn`, or a failed result if an error is thrown
 *
 * @example
 * ```typescript
 * async execute(context: RunbookContext): Promise<StepResult<Data>> {
 *   return executeStep('CloudWatch Logs query', async () => {
 *     const results = await context.services.cloudWatchLogs.query(...);
 *     return { success: true, output: results };
 *   });
 * }
 * ```
 */
export async function executeStep<T>(label: string, fn: StepExecutionHandler<T>): Promise<StepResult<T>> {
  try {
    return await fn();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `${label} failed: ${message}` };
  }
}
