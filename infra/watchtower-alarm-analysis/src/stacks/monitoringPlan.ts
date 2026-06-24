import type { ExecuteRunbookQueueRegistryEntryV1 } from '@go-automation/go-execute-runbook-contracts';

import type { ExecuteRunbookDeploymentConfig } from '../config/DeploymentConfig.js';
import {
  EXECUTE_RUNBOOK_BATCH_SIZE,
  EXECUTE_RUNBOOK_LAMBDA_TIMEOUT_SECONDS,
  EXECUTE_RUNBOOK_MAX_RECEIVE_COUNT,
  EXECUTE_RUNBOOK_MESSAGE_RETENTION_SECONDS,
  EXECUTE_RUNBOOK_RESERVED_CONCURRENCY,
  EXECUTE_RUNBOOK_VISIBILITY_TIMEOUT_SECONDS,
  assertExecuteRunbookCapacityConstants,
} from '../config/constants.js';

export interface ExecuteRunbookResourceNames {
  readonly stackName: string;
  readonly lambdaName: string;
  readonly queueName: string;
  readonly dlqName: string;
  readonly logGroupName: string;
  readonly oamSinkName: string;
}

export interface ExecuteRunbookMonitoringPlan {
  readonly names: ExecuteRunbookResourceNames;
  readonly lambdaTimeoutSeconds: number;
  readonly visibilityTimeoutSeconds: number;
  readonly messageRetentionSeconds: number;
  readonly maxReceiveCount: number;
  readonly reservedConcurrency: number;
  readonly batchSize: 1;
  readonly partialBatchResponse: true;
  readonly dlqHasConsumer: false;
  readonly runtime: 'nodejs24.x';
  readonly architecture: 'arm64';
  readonly queueSendPrincipals: readonly [string, string];
}

export function buildExecuteRunbookMonitoringPlan(
  config: ExecuteRunbookDeploymentConfig,
): ExecuteRunbookMonitoringPlan {
  assertExecuteRunbookCapacityConstants();
  const base = 'go-execute-runbook';
  return {
    names: {
      stackName: base,
      lambdaName: base,
      queueName: `${base}.fifo`,
      dlqName: `${base}-dlq.fifo`,
      logGroupName: `/aws/lambda/${base}`,
      oamSinkName: `${base}-oam`,
    },
    lambdaTimeoutSeconds: EXECUTE_RUNBOOK_LAMBDA_TIMEOUT_SECONDS,
    visibilityTimeoutSeconds: EXECUTE_RUNBOOK_VISIBILITY_TIMEOUT_SECONDS,
    messageRetentionSeconds: EXECUTE_RUNBOOK_MESSAGE_RETENTION_SECONDS,
    maxReceiveCount: EXECUTE_RUNBOOK_MAX_RECEIVE_COUNT,
    reservedConcurrency: EXECUTE_RUNBOOK_RESERVED_CONCURRENCY,
    batchSize: EXECUTE_RUNBOOK_BATCH_SIZE,
    partialBatchResponse: true,
    dlqHasConsumer: false,
    runtime: 'nodejs24.x',
    architecture: 'arm64',
    queueSendPrincipals: [config.slackIngesterRoleArn, config.watchtowerBackendRoleArn],
  };
}

export function buildQueueRegistryEntry(
  plan: ExecuteRunbookMonitoringPlan,
  queueUrl: string,
  queueArn: string,
): ExecuteRunbookQueueRegistryEntryV1 {
  return {
    queueUrl,
    queueArn,
    stackName: plan.names.stackName,
    messageRetentionSeconds: plan.messageRetentionSeconds,
  };
}
