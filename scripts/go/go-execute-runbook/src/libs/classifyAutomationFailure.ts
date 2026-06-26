import type { ExecutionAbortCause } from '../types/ExecutionAbortCause.js';
import type { WorkerDisposition } from '../types/WorkerDisposition.js';

/** Central default-prudent failure classifier; permanent failures are supplied explicitly by validated callers. */
export function classifyAutomationFailure(error: unknown, abortCause?: ExecutionAbortCause): WorkerDisposition {
  if (abortCause === 'USER_CANCELLED') return 'CANCEL_EXECUTION';
  if (abortCause === 'STALE_ATTEMPT') return 'COMPLETE_OUTCOME';
  if (isPermanentWorkerFailure(error)) return 'FAIL_EXECUTION';
  return 'RETRY_MESSAGE';
}

function isPermanentWorkerFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('workerFailureCode' in error)) return false;
  const code = error.workerFailureCode;
  return (
    code === 'INVALID_COMMAND' ||
    code === 'UNSUPPORTED_COMMAND_VERSION' ||
    code === 'WORKER_CONFIGURATION_ERROR' ||
    code === 'INTERNAL_INVARIANT'
  );
}
