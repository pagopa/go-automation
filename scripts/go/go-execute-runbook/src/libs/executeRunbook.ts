import { AWS } from '@go-automation/go-common';
import { classifyRunbookOutcome, noRunbookCheck } from '@go-automation/go-runbook';
import type { RunbookCheck, RunbookOutput, ServiceRegistry } from '@go-automation/go-runbook';
import type {
  AcknowledgeCancellationRequest,
  CompleteExecutionRequest,
  AutomaticRunbookExecutionStatus,
  StartExecutionRequest,
} from '@go-automation/go-watchtower-client';
import { RUNBOOK_REGISTRY, executeRunbookForOccurrence } from 'go-analyze-alarm/api';

import type { ExecuteRunbookDelivery } from '../types/ExecuteRunbookDelivery.js';
import type { ExecuteRunbookDeps } from '../types/ExecuteRunbookDeps.js';
import type { ExecuteRunbookInput } from '../types/ExecuteRunbookInput.js';
import type { ExecuteRunbookResult } from '../types/ExecuteRunbookResult.js';
import type { ExecuteRunbookSuppressedReason } from '../types/ExecuteRunbookResult.js';
import { buildTrackingEntries } from './buildTrackingEntries.js';
import { CancellationMonitor } from './CancellationMonitor.js';
import { classifyAutomationOutcome } from './classifyAutomationOutcome.js';
import { ExecutionAbortCoordinator } from './ExecutionAbortCoordinator.js';
import { formatCleanupWarnings } from './formatCleanupWarnings.js';

/** Runs one fenced Watchtower execution and returns normally only when SQS may ACK it. */
export async function executeRunbook(
  deps: ExecuteRunbookDeps,
  input: ExecuteRunbookInput,
  delivery: ExecuteRunbookDelivery,
): Promise<ExecuteRunbookResult> {
  const executionId = input.executionId;
  const startRequest: StartExecutionRequest = {
    sqsMessageId: delivery.sqsMessageId,
    approximateReceiveCount: delivery.approximateReceiveCount,
    workerDeadlineAt: delivery.workerDeadlineAt,
  };
  const start = await deps.watchtower.startExecution(executionId, startRequest, {
    idempotencyKey: `start:${executionId}:${delivery.sqsMessageId}:${delivery.approximateReceiveCount}`,
    deadlineAtMs: Date.parse(delivery.workerDeadlineAt),
  });

  if (start.disposition === 'ALREADY_RUNNING') {
    return suppressed(executionId, 'RUNNING', 'ALREADY_RUNNING');
  }
  if (start.disposition === 'ALREADY_TERMINAL') {
    return suppressed(executionId, start.status, 'ALREADY_TERMINAL');
  }
  if (start.disposition === 'CANCEL_REQUESTED') {
    return suppressed(executionId, 'CANCEL_REQUESTED', 'CANCEL_REQUESTED');
  }

  const attemptId = start.attemptId;
  const coordinator = new ExecutionAbortCoordinator();
  const activeOperations = new AWS.AWSActiveOperationRegistry();
  const monitor = new CancellationMonitor(deps.watchtower, executionId, attemptId, delivery, coordinator);
  const timeoutMs = Date.parse(delivery.workerDeadlineAt) - Date.now();
  const budgetTimer = setTimeout(() => coordinator.abort('TIME_BUDGET'), Math.max(1, timeoutMs));

  try {
    await monitor.start('RUNBOOK_EXECUTION');
    const output = await runOccurrence(deps, input, coordinator, activeOperations);
    if (coordinator.cause === 'USER_CANCELLED') {
      return await acknowledgeCancellation(
        deps,
        executionId,
        delivery,
        attemptId,
        coordinator,
        monitor,
        activeOperations,
      );
    }
    if (coordinator.cause !== undefined) throw new Error(coordinator.cause);

    const check = output === undefined ? noRunbookCheck() : classifyRunbookOutcome(output);
    const completeRequest = buildCompleteRequest(attemptId, check, output);
    const completeResult = await deps.watchtower.completeExecution(executionId, completeRequest, {
      idempotencyKey: `complete:${executionId}:${attemptId}`,
      deadlineAtMs: Date.parse(delivery.workerDeadlineAt),
      signal: coordinator.signal,
    });
    if ('conflict' in completeResult) {
      if (completeResult.conflict === 'CANCELLATION_REQUESTED') {
        await monitor.progress('CANCELLATION_REQUESTED');
        return await acknowledgeCancellation(
          deps,
          executionId,
          delivery,
          attemptId,
          coordinator,
          monitor,
          activeOperations,
        );
      }
      if (completeResult.conflict === 'IDEMPOTENCY_PAYLOAD_MISMATCH') {
        return { disposition: 'COMPLETE_OUTCOME', executionId, attemptId, status: completeResult.status ?? 'FAILED' };
      }
      throw new Error(`Complete callback conflict: ${completeResult.conflict}`);
    }
    if ('staleAttempt' in completeResult && completeResult.staleAttempt === true) {
      return {
        disposition: 'COMPLETE_OUTCOME',
        executionId,
        attemptId,
        status: completeResult.status,
        suppressedReason: 'STALE_ATTEMPT',
      };
    }
    return { disposition: 'COMPLETE_OUTCOME', executionId, attemptId, status: completeResult.status };
  } catch (error: unknown) {
    if (coordinator.cause === 'USER_CANCELLED') {
      return await acknowledgeCancellation(
        deps,
        executionId,
        delivery,
        attemptId,
        coordinator,
        monitor,
        activeOperations,
      );
    }
    throw error;
  } finally {
    clearTimeout(budgetTimer);
    await monitor.stop();
  }
}

async function runOccurrence(
  deps: ExecuteRunbookDeps,
  input: ExecuteRunbookInput,
  coordinator: ExecutionAbortCoordinator,
  activeOperations: AWS.AWSActiveOperationRegistry,
): Promise<RunbookOutput | undefined> {
  if (!RUNBOOK_REGISTRY.has(input.alarmEvent.alarmName)) return undefined;
  return await executeRunbookForOccurrence(
    { logger: deps.logger, services: scopedServices(deps, input, activeOperations) },
    {
      alarmName: input.alarmEvent.alarmName,
      firedAt: input.alarmEvent.firedAt,
      awsAccountId: input.alarmEvent.awsAccountId,
      region: input.alarmEvent.awsRegion,
      awsProfiles: [],
      executionMode: 'cloud',
      signal: coordinator.signal,
    },
  );
}

function scopedServices(
  deps: ExecuteRunbookDeps,
  input: ExecuteRunbookInput,
  activeOperations: AWS.AWSActiveOperationRegistry,
): ServiceRegistry {
  return {
    ...deps.services,
    cloudWatchLogs: deps.cloudWatchLogs.forTarget(
      { accountId: input.alarmEvent.awsAccountId, region: input.alarmEvent.awsRegion },
      activeOperations,
    ),
    athena: deps.athena.forExecution(activeOperations),
  };
}

function buildCompleteRequest(
  attemptId: string,
  check: RunbookCheck,
  output: RunbookOutput | undefined,
): CompleteExecutionRequest {
  const stats = output?.telemetry?.cloudWatchLogs?.statistics;
  return {
    attemptId,
    outcome: classifyAutomationOutcome(check),
    ...(output === undefined
      ? {}
      : {
          runbookKey: output.runbook.id,
          runbookVersion: output.runbook.version,
          engineExecutionId: output.execution.executionId,
          analysisPayload: output,
          resultSummary: check,
          tracking: buildTrackingEntries(output),
        }),
    ...(stats === undefined
      ? {}
      : {
          queryCount: output?.telemetry?.cloudWatchLogs?.queryCount ?? 0,
          bytesScanned: decimalMetric(stats.bytesScanned),
          recordsScanned: decimalMetric(stats.recordsScanned),
          recordsMatched: decimalMetric(stats.recordsMatched),
        }),
    ...(check.error === undefined ? {} : { errorMessage: check.error.slice(0, 2_048) }),
  };
}

async function acknowledgeCancellation(
  deps: ExecuteRunbookDeps,
  executionId: string,
  delivery: ExecuteRunbookDelivery,
  attemptId: string,
  coordinator: ExecutionAbortCoordinator,
  monitor: CancellationMonitor,
  activeOperations: AWS.AWSActiveOperationRegistry,
): Promise<ExecuteRunbookResult> {
  await monitor.stop();
  const warnings = await activeOperations.stopAll();
  const cancelRequestId = monitor.cancelRequestId;
  if (cancelRequestId === undefined) throw new Error('Cancellation requested without a cancelRequestId');
  const request: AcknowledgeCancellationRequest = {
    attemptId,
    cancelRequestId,
    sqsMessageId: delivery.sqsMessageId,
    approximateReceiveCount: delivery.approximateReceiveCount,
    lastPhase: 'RUNBOOK_EXECUTION',
    cleanupWarnings: formatCleanupWarnings(warnings),
  };
  const result = await deps.watchtower.acknowledgeCancellation(executionId, request, {
    idempotencyKey: `cancel-ack:${executionId}:${cancelRequestId}:${attemptId}`,
    deadlineAtMs: Date.parse(delivery.workerDeadlineAt),
  });
  if ('conflict' in result) throw new Error(`Cancellation acknowledgement conflict: ${result.conflict}`);
  coordinator.abort('USER_CANCELLED');
  return { disposition: 'CANCEL_EXECUTION', executionId, attemptId, status: result.status };
}

function suppressed(
  executionId: string,
  status: AutomaticRunbookExecutionStatus,
  reason: ExecuteRunbookSuppressedReason,
): ExecuteRunbookResult {
  return { disposition: 'COMPLETE_OUTCOME', executionId, status, suppressedReason: reason };
}

function decimalMetric(value: number): string {
  return Math.max(0, Math.round(value)).toString();
}
