import type { FailExecutionRequest } from '@go-automation/go-watchtower-client';
import type { AwsAccountError } from '@pagopa/go-runbook/toolkits/common';

import type { ExecuteRunbookDeps } from '../types/ExecuteRunbookDeps.js';

/** Account errors about the occurrence rather than the worker configuration. */
const OCCURRENCE_CODES: ReadonlySet<string> = new Set([
  'AWS_OCCURRENCE_ACCOUNT_MISMATCH',
  'AWS_ACCOUNT_ENVIRONMENT_NOT_ALLOWED',
]);

/**
 * Closes the active attempt when the runbook cannot read its logical AWS accounts
 * (EVO-AWSACCT-OPUS-01 §6.4). The failure is permanent: retrying the message would
 * fail the same way until the configuration changes.
 *
 * - occurrence outside the runbook's accounts or environments → `CAPABILITY` / `RUNBOOK_CAPABILITY_MISMATCH`;
 * - missing directory entry, environment, unreachable account, ambiguous selection →
 *   `WORKER_CONFIGURATION` / `WORKER_CONFIGURATION_ERROR`.
 *
 * The message carries the stable account error code. Transient STS errors are not
 * `AwsAccountError` and keep the prudent SQS retry.
 *
 * @param deps - Worker dependencies, for the Watchtower client
 * @param executionId - Execution whose attempt is closed
 * @param attemptId - Active attempt
 * @param error - The account error
 * @param deadlineAtMs - Deadline of the callback
 * @returns `true` if Watchtower accepted the failure; `false` leaves the retry to SQS
 */
export async function failAccountErrorAttempt(
  deps: ExecuteRunbookDeps,
  executionId: string,
  attemptId: string,
  error: AwsAccountError,
  deadlineAtMs: number,
): Promise<boolean> {
  const occurrence = OCCURRENCE_CODES.has(error.code);
  const request: FailExecutionRequest = {
    scope: 'ACTIVE_ATTEMPT',
    attemptId,
    errorCategory: occurrence ? 'CAPABILITY' : 'WORKER_CONFIGURATION',
    errorCode: occurrence ? 'RUNBOOK_CAPABILITY_MISMATCH' : 'WORKER_CONFIGURATION_ERROR',
    errorMessage: `[${error.code}] ${error.message}`.slice(0, 2_048),
    failedPhase: 'RUNBOOK_EXECUTION',
    retryable: false,
  };
  try {
    const result = await deps.watchtower.failExecution(executionId, request, {
      idempotencyKey: `fail:${executionId}:${attemptId}:${error.code}`,
      deadlineAtMs,
    });
    return !('conflict' in result);
  } catch {
    return false;
  }
}
