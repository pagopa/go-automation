import type { Context, SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from 'aws-lambda';

import { Core } from '@go-automation/go-common';
import {
  buildExecuteRunbookDeps,
  classifyAutomationFailure,
  executeRunbook,
  failPreStartCommand,
  parseExecuteRunbookMessage,
  recoverValidExecutionId,
} from 'go-execute-runbook/api';
import type {
  ExecuteRunbookConfig,
  ExecuteRunbookDelivery,
  ExecuteRunbookDeps,
  ExecuteRunbookInput,
  ExecuteRunbookResult,
} from 'go-execute-runbook/api';
import { scriptMetadata, scriptParameters } from 'go-execute-runbook/config';

type ExecuteRunbookFn = (
  deps: ExecuteRunbookDeps,
  input: ExecuteRunbookInput,
  delivery: ExecuteRunbookDelivery,
) => Promise<ExecuteRunbookResult>;
type RemainingTimeFn = () => number;

const LAMBDA_SHUTDOWN_SAFETY_MS = 30_000;

const script = new Core.GOScript({ metadata: scriptMetadata, config: { parameters: scriptParameters } });

export const handler = script.createLambdaHandler<SQSEvent, SQSBatchResponse, Context>(async (event, context) => {
  const config = await script.getConfiguration<ExecuteRunbookConfig>();
  let deps: ExecuteRunbookDeps;
  try {
    deps = await buildExecuteRunbookDeps(script, config);
  } catch (error: unknown) {
    script.logger.error(`Failed to build ExecuteRunbook dependencies: ${Core.getErrorMessage(error)}`);
    return { batchItemFailures: event.Records.map((record) => ({ itemIdentifier: record.messageId })) };
  }
  return await processExecuteRunbookBatch(event, deps, () => context?.getRemainingTimeInMillis() ?? 0);
});

export async function processExecuteRunbookBatch(
  event: SQSEvent,
  deps: ExecuteRunbookDeps,
  remainingTime: RemainingTimeFn,
  execute: ExecuteRunbookFn = executeRunbook,
): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchItemFailure[] = [];
  for (const record of event.Records) {
    let delivery: ExecuteRunbookDelivery | undefined;
    try {
      delivery = deliveryFrom(record.messageId, record.attributes.ApproximateReceiveCount, remainingTime());
      const input = parseExecuteRunbookMessage(record.body);
      await execute(deps, input, delivery);
    } catch (error: unknown) {
      const executionId = recoverValidExecutionId(record.body);
      if (
        classifyAutomationFailure(error) === 'FAIL_EXECUTION' &&
        executionId !== undefined &&
        delivery !== undefined
      ) {
        try {
          await failPreStartCommand(deps, executionId, delivery, error);
          continue;
        } catch {
          // A terminal callback that cannot be confirmed remains an SQS retry.
        }
      }
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
}

function deliveryFrom(
  sqsMessageId: string,
  approximateReceiveCountRaw: string,
  remainingTimeMs: number,
): ExecuteRunbookDelivery {
  const approximateReceiveCount = Number.parseInt(approximateReceiveCountRaw, 10);
  if (!Number.isInteger(approximateReceiveCount) || approximateReceiveCount < 1) {
    throw new Error('Invalid SQS ApproximateReceiveCount');
  }
  if (remainingTimeMs <= LAMBDA_SHUTDOWN_SAFETY_MS) {
    throw new Error('Insufficient Lambda time remaining for ExecuteRunbook delivery');
  }
  const budgetMs = remainingTimeMs - LAMBDA_SHUTDOWN_SAFETY_MS;
  return {
    sqsMessageId,
    approximateReceiveCount,
    workerDeadlineAt: new Date(Date.now() + budgetMs).toISOString(),
  };
}
