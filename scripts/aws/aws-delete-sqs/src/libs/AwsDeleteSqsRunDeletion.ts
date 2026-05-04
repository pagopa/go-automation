/**
 * AWS Delete SQS - Run Deletion Library
 */

import { Core, AWS } from '@go-automation/go-common';
import type { AwsDeleteSqsConfig } from '../types/index.js';
import { resolveMessageAction } from './AwsDeleteSqsResolveMessageAction.js';

/**
 * Run the deletion process
 * @param sqsService - SQS service instance
 * @param config - Configuration for the script
 * @param queueUrl - Queue URL
 * @param targetIds - Set of message IDs to delete
 * @param script - Script instance
 * @returns Promise<AWS.SQSProcessResult> - Result of the operation
 */

export async function runDeletion(
  sqsService: AWS.AWSSQSService,
  config: AwsDeleteSqsConfig,
  queueUrl: string,
  targetIds: Set<string> | undefined,
  script: Core.GOScript,
): Promise<AWS.SQSProcessResult> {
  script.prompt.startSpinner('Processing messages...');

  const result = await sqsService.processMessages(
    {
      queueUrl,
      visibilityTimeout: config.visibilityTimeout,
      maxEmptyReceives: config.maxEmptyReceives,
      limit: targetIds?.size,
      batchSize: config.batchSize,
    },
    (message) => resolveMessageAction(message, config, targetIds),
    {
      onProgress: (received, deleted, released, skipped) => {
        script.prompt.updateSpinner(
          `Received: ${received} | Deleted: ${deleted} | Released: ${released} | Skipped: ${skipped}`,
        );
      },
      onEmptyReceive: (consecutive, max) => {
        script.prompt.updateSpinner(`Empty receive (${consecutive}/${max})... Still searching...`);
      },
    },
  );

  script.prompt.spinnerStop(`Operation completed (${result.stopReason}).`);
  return result;
}
