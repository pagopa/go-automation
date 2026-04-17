/**
 * Send Put SQS - Main Logic Module
 *
 * Implements bulk message sending to SQS with surgical retries for partial batch failures.
 * Supports text, JSON, and CSV input formats.
 */

import * as crypto from 'node:crypto';
import { Core } from '@go-automation/go-common';
import {
  SendMessageBatchCommand,
  type SendMessageBatchRequestEntry,
} from '@aws-sdk/client-sqs';

import type { SendPutSqsConfig } from './types/SendPutSqsConfig.js';

/**
 * Statistics for the bulk operation
 */
interface BulkStats {
  processed: number;
  success: number;
  failed: number;
  retries: number;
}

/**
 * Main script execution function
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<SendPutSqsConfig>();
  const stats: BulkStats = { processed: 0, success: 0, failed: 0, retries: 0 };
  const startTime = Date.now();

  script.logger.section('Initialization');
  script.logger.info(`Target Queue: ${config.queueUrl}`);
  script.logger.info(`Input File: ${config.inputFile}`);

  // Step 1: Initialize the appropriate importer
  const importer = initializeImporter(script, config);
  const inputPath = script.paths.resolvePath(config.inputFile, Core.GOPathType.INPUT);

  script.logger.section('Processing Messages');
  script.prompt.startSpinner('Reading and sending messages...');

  let batch: string[] = [];
  const batchSize = Math.min(config.batchSize, 10);

  try {
    for await (const message of importer.importStream(inputPath)) {
      if (typeof message !== 'string' && message !== null && message !== undefined) {
        // For JSON/CSV, if not string, convert to JSON string
        batch.push(typeof message === 'object' ? JSON.stringify(message) : String(message));
      } else if (typeof message === 'string') {
        batch.push(message);
      }

      if (batch.length >= batchSize) {
        await processBatch(script, config, batch, stats);
        batch = [];
        updateProgress(script, stats);
      }
    }

    // Process final remaining batch
    if (batch.length > 0) {
      await processBatch(script, config, batch, stats);
      updateProgress(script, stats);
    }

    script.prompt.spinnerStop('Processing completed');
  } catch (error) {
    script.prompt.spinnerStop('Processing failed');
    throw error;
  }

  // Step 2: Final summary
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  script.logger.section('Operation Summary');
  script.logger.info(`Total processed:  ${stats.processed}`);
  script.logger.success(`Successfully sent: ${stats.success}`);
  if (stats.failed > 0) {
    script.logger.error(`Permanently failed: ${stats.failed}`);
  }
  script.logger.info(`Total retries:    ${stats.retries}`);
  script.logger.info(`Duration:         ${durationSec}s`);

  if (stats.failed > 0) {
    throw new Error(`Completed with ${stats.failed} permanent failures.`);
  }
}

/**
 * Initializes the appropriate importer based on configuration or file extension
 */
function initializeImporter(_script: Core.GOScript, config: SendPutSqsConfig): Core.GOListImporter<any> {
  const extension = config.inputFile.split('.').pop()?.toLowerCase();
  const format = config.fileFormat === 'auto' ? extension : config.fileFormat;

  switch (format) {
    case 'json':
      return new Core.GOJSONListImporter({
        jsonl: 'auto',
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
async function processBatch(
  script: Core.GOScript,
  config: SendPutSqsConfig,
  messages: string[],
  stats: BulkStats,
): Promise<void> {
  const batchId = Math.random().toString(36).substring(2, 7);
  let entries: SendMessageBatchRequestEntry[] = messages.map((body, index) => ({
    Id: `${batchId}-${index}`,
    MessageBody: body,
    DelaySeconds: config.delaySeconds > 0 ? config.delaySeconds : undefined,
    ...(config.queueUrl.endsWith('.fifo')
      ? {
          MessageGroupId: config.fifoGroupId ?? 'default-group',
          MessageDeduplicationId:
            config.fifoDeduplicationStrategy === 'hash'
              ? crypto.createHash('sha256').update(body).digest('hex')
              : undefined,
        }
      : {}),
  }));

  let attempt = 0;
  const maxRetries = config.batchMaxRetries;

  while (entries.length > 0) {
    stats.processed += attempt === 0 ? entries.length : 0;

    try {
      const command = new SendMessageBatchCommand({
        QueueUrl: config.queueUrl,
        Entries: entries,
      });

      const response = await script.aws.sqs.send(command);

      const successfulCount = response.Successful?.length ?? 0;
      stats.success += successfulCount;

      if (!response.Failed || response.Failed.length === 0) {
        break; // All successful
      }

      // Handle partial failures
      const failedIds = new Set(
        (response.Failed ?? [])
          .map((f) => f.Id)
          .filter((id): id is string => id !== undefined)
      );
      const failedEntries = entries.filter((e) => e.Id !== undefined && failedIds.has(e.Id));

      if (attempt < maxRetries) {
        attempt++;
        stats.retries += failedEntries.length;
        const delay = Math.pow(2, attempt) * 500;
        
        script.logger.warning(
          `Batch ${batchId}: ${failedEntries.length} messages failed. ` +
          `Retrying in ${delay}ms (Attempt ${attempt}/${maxRetries})...`
        );
        
        await new Promise((resolve) => setTimeout(resolve, delay));
        entries = failedEntries;
      } else {
        // Max retries exhausted
        script.logger.error(`Batch ${batchId}: ${failedEntries.length} messages permanently failed after ${maxRetries} retries.`);
        for (const failure of response.Failed) {
          script.logger.error(`  - ID ${failure.Id}: [${failure.Code}] ${failure.Message}`);
        }
        stats.failed += failedEntries.length;
        break;
      }
    } catch (error) {
      // Entire batch call failed (e.g., network error, DNS, etc.)
      if (attempt < maxRetries) {
        attempt++;
        stats.retries += entries.length;
        const delay = Math.pow(2, attempt) * 500;
        script.logger.warning(`Batch ${batchId}: API call failed. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        script.logger.error(`Batch ${batchId}: API call permanently failed: ${Core.getErrorMessage(error)}`);
        stats.failed += entries.length;
        break;
      }
    }
  }
}

/**
 * Updates the spinner with current progress
 */
function updateProgress(script: Core.GOScript, stats: BulkStats): void {
  script.prompt.updateSpinner(
    `Sent: ${stats.success} | Failed: ${stats.failed} | Retries: ${stats.retries}`
  );
}
