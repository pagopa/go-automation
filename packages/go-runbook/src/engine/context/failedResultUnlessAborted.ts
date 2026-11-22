import { getErrorMessage } from '@pagopa/go-common/errors';
import type { RunbookContext } from '../types/RunbookContext.js';

/**
 * The failed result of a unit of work (a step, a read, an action) that threw: a cancellation stays a cancellation, any
 * other error becomes a failure with its message, so that the caller decides what the failure means.
 *
 * @param context - Context of the work, whose abort signal tells a cancellation from a failure
 * @param error - What the work threw
 * @returns The failure, with the message of the error
 * @throws The error itself when the execution was cancelled
 *
 * @example
 * ```typescript
 * try {
 *   result = await step.execute(context);
 * } catch (error: unknown) {
 *   result = failedResultUnlessAborted(context, error);
 * }
 * ```
 */
export function failedResultUnlessAborted(
  context: Pick<RunbookContext, 'signal'>,
  error: unknown,
): { readonly success: false; readonly error: string } {
  if (context.signal?.aborted === true) throw error;
  return { success: false, error: getErrorMessage(error) };
}
