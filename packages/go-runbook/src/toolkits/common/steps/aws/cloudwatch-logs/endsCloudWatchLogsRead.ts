import type { RunbookContext } from '../../../../../engine/index.js';

/** Codes of the configuration errors of the execution target: no other read can recover them. */
const TARGET_CONFIGURATION_ERROR_CODES: ReadonlySet<string> = new Set(['OAM_REGION_MISMATCH', 'INVALID_OAM_TARGET']);

/**
 * Whether the error of a Logs Insights read ends the step instead of becoming an `unavailable` read: the execution
 * was cancelled, or the execution target is misconfigured.
 *
 * @param context - Context of the step, whose abort signal tells a cancellation
 * @param error - Error of the read
 * @returns `true` when the error must be thrown again
 *
 * @example
 * ```typescript
 * if (endsCloudWatchLogsRead(context, error)) throw error;
 * ```
 */
export function endsCloudWatchLogsRead(context: Pick<RunbookContext, 'signal'>, error: unknown): boolean {
  if (context.signal?.aborted === true) return true;
  const code: unknown = error instanceof Error && 'code' in error ? error.code : undefined;
  return typeof code === 'string' && TARGET_CONFIGURATION_ERROR_CODES.has(code);
}
