/**
 * AWS Put SQS - Main Logic Module
 *
 * Implements bulk message sending to SQS with surgical retries for partial batch failures.
 * Supports text, JSON, and CSV input formats.
 */

import { Core, AWS } from '@go-automation/go-common';

import type { AwsPutSqsConfig } from './types/AwsPutSqsConfig.js';
import { initializeImporter, processBatch, updateProgress, type BulkStats } from './libs/SqsService.js';

/**
 * Main script execution function.
 *
 * @param script - The GOScript instance
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<AwsPutSqsConfig>();
  script.logger.section('AWS Put SQS');
  const stats: BulkStats = { processed: 0, success: 0, failed: 0, retries: 0 };
  const startTime = Date.now();

  script.logger.section('Initialization');
  // Resolve queue identifier
  const queueNameOrUrl = config.queueUrl ?? config.queueName;
  if (!queueNameOrUrl) {
    throw new Error('Either --queue-name or --queue-url must be provided');
  }

  const sqsService = new AWS.AWSSQSService(script.aws.sqs, script.aws.cloudWatch);
  const metadata = await sqsService.resolveQueueMetadata(queueNameOrUrl);

  script.logger.info(`Target Queue: ${metadata.queueUrl}`);
  script.logger.info(`Input File: ${config.inputFile}`);

  // Step 1: Initialize the appropriate importer
  const importer = initializeImporter(script, config);
  const inputPath = script.paths.resolvePath(config.inputFile, Core.GOPathType.INPUT);

  script.logger.section('Processing Messages');
  script.prompt.startSpinner('Reading and sending messages...');

  let currentBatch: string[] = [];
  const batchSize = Math.min(config.batchSize, AWS.SQS_MAX_BATCH_SIZE);

  try {
    for await (const message of importer.importStream(inputPath)) {
      if (typeof message === 'string') {
        currentBatch.push(message);
      } else if (message !== null && message !== undefined) {
        currentBatch.push(JSON.stringify(message));
      }

      if (currentBatch.length >= batchSize) {
        await processBatch(script, config, metadata.queueUrl, currentBatch, stats);
        currentBatch = [];
        updateProgress(script, stats);
      }
    }

    // Process final remaining batch
    if (currentBatch.length > 0) {
      await processBatch(script, config, metadata.queueUrl, currentBatch, stats);
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
