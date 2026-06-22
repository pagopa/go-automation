import type { FailExecutionRequest } from '@go-automation/go-watchtower-client';

import type { ExecuteRunbookDelivery } from '../types/ExecuteRunbookDelivery.js';
import type { ExecuteRunbookDeps } from '../types/ExecuteRunbookDeps.js';

export async function failPreStartCommand(
  deps: ExecuteRunbookDeps,
  executionId: string,
  delivery: ExecuteRunbookDelivery,
  error: unknown,
): Promise<void> {
  const errorCode = commandErrorCode(error);
  const request: FailExecutionRequest = {
    scope: 'PRE_START',
    errorCategory: 'COMMAND',
    errorCode,
    errorMessage: boundedMessage(error),
    failedPhase: 'COMMAND_VALIDATION',
    retryable: false,
    sqsMessageId: delivery.sqsMessageId,
    approximateReceiveCount: delivery.approximateReceiveCount,
  };
  const deliveryKey = `${delivery.sqsMessageId}:${delivery.approximateReceiveCount}`;
  const result = await deps.watchtower.failExecution(executionId, request, {
    idempotencyKey: `fail:${executionId}:${deliveryKey}:${errorCode}`,
    deadlineAtMs: Date.parse(delivery.workerDeadlineAt),
  });
  if ('conflict' in result && result.conflict !== 'IDEMPOTENCY_PAYLOAD_MISMATCH') {
    throw new Error(`Pre-start failure callback conflict: ${result.conflict}`);
  }
}

function commandErrorCode(error: unknown): 'INVALID_COMMAND' | 'UNSUPPORTED_COMMAND_VERSION' {
  if (typeof error === 'object' && error !== null && 'workerFailureCode' in error) {
    if (error.workerFailureCode === 'UNSUPPORTED_COMMAND_VERSION') return 'UNSUPPORTED_COMMAND_VERSION';
  }
  return 'INVALID_COMMAND';
}

function boundedMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2_048);
}
