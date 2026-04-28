/**
 * SQS Service Helpers for aws-put-sqs
 */

import { Core, AWS } from '@go-automation/go-common';

import type { AwsPutSqsConfig } from '../types/AwsPutSqsConfig.js';

/**
 * Statistics for the bulk operation
 */
export interface BulkStats {
  processed: number;
  success: number;
  failed: number;
  retries: number;
}

/**
 * Initializes the appropriate importer based on configuration or file extension
 */
export function initializeImporter(_script: Core.GOScript, config: AwsPutSqsConfig): Core.GOListImporter<unknown> {
  const extension = config.inputFile.split('.').pop()?.toLowerCase();
  const format = config.fileFormat === 'auto' ? extension : config.fileFormat;

  switch (format) {
    case 'json':
      return new Core.GOJSONListImporter({
        jsonl: 'auto',
        wrapSingleObject: true,
      });
    case 'csv':
      return new Core.GOCSVListImporter({
        hasHeaders: true,
        rowTransformer: (row: Record<string, string | undefined>) => row[config.csvColumn],
      });
    case 'text':
    case 'txt':
    default:
      return new Core.GOFileListImporter();
  }
}

/**
 * Processes a single batch of messages with retries
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

/**
 * Updates the spinner with current progress
 */
export function updateProgress(script: Core.GOScript, stats: BulkStats): void {
  script.prompt.updateSpinner(`Sent: ${stats.success} | Failed: ${stats.failed} | Retries: ${stats.retries}`);
}
