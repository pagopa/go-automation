/**
 * AWS Put SQS - Process Batch
 *
 * Processes a single batch of messages with retries.
 */

import { Core, AWS } from '@go-automation/go-common';
import type { AwsPutSqsConfig } from '../types/AwsPutSqsConfig.js';
import type { BulkStats } from './AwsPutSqsBulkStats.js';

/**
 * Processes a single batch of messages with retries
 * @param script - Script instance
 * @param config - Configuration for the script
 * @param queueUrl - URL of the SQS queue
 * @param messages - Array of messages to send
 * @param stats - Statistics object to update
 */

export async function processBatch(
  script: Core.GOScript,
  config: AwsPutSqsConfig,
  queueUrl: string,
  messages: string[],
  stats: BulkStats,
): Promise<void> {
  const batchId = Math.random().toString(36).substring(2, 7);
  const sqsService = new AWS.AWSSQSService(script.aws.sqs, script.aws.cloudWatch);

  const entries: AWS.SendMessageBatchRequestEntry[] = messages.map((body, index) => {
    // Validate message size and content
    AWS.SQSUtils.validateMessageSize(body);

    return {
      Id: `${batchId}-${index}`,
      MessageBody: body,
      DelaySeconds: config.delaySeconds > 0 ? config.delaySeconds : undefined,
      ...(queueUrl.endsWith('.fifo')
        ? {
            MessageGroupId: config.fifoGroupId ?? 'default-group',
            MessageDeduplicationId:
              config.fifoDeduplicationStrategy === 'hash' ? sqsService.computeMessageFingerprint(body) : undefined,
          }
        : {}),
    };
  });

  stats.processed += entries.length;

  const response = await sqsService.sendMessageBatchWithRetries(queueUrl, entries, {
    maxRetries: config.batchMaxRetries,
    onRetry: (failedCount: number, attempt: number) => {
      stats.retries += failedCount;
      script.logger.warning(
        `Batch ${batchId}: ${failedCount} messages failed. Retrying (Attempt ${attempt}/${config.batchMaxRetries})...`,
      );
    },
  });

  stats.success += response.Successful?.length ?? 0;

  if (response.Failed && response.Failed.length > 0) {
    script.logger.error(
      `Batch ${batchId}: ${response.Failed.length} messages permanently failed after ${config.batchMaxRetries} retries.`,
    );
    for (const failure of response.Failed) {
      script.logger.error(`  - ID ${failure.Id}: [${failure.Code}] ${failure.Message}`);
    }
    stats.failed += response.Failed.length;
  }
}
