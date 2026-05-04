/**
 * AWS Put SQS - Stream Messages
 */

import { Core, AWS } from '@go-automation/go-common';
import type { AwsPutSqsConfig } from '../types/AwsPutSqsConfig.js';
import { initializeImporter } from './AwsPutSqsInitializeImporter.js';
import type { BulkStats } from './AwsPutSqsBulkStats.js';
import { normalizeMessage } from './AwsPutSqsNormalizeMessage.js';
import { flushBatch } from './AwsPutSqsFlushBatch.js';

/**
 * Stream messages to SQS
 * @param script - GOScript instance
 * @param config - Script configuration
 * @param queueUrl - Queue URL
 * @returns Promise with statistics
 */
export async function streamMessages(
  script: Core.GOScript,
  config: AwsPutSqsConfig,
  queueUrl: string,
): Promise<BulkStats> {
  const stats: BulkStats = { processed: 0, success: 0, failed: 0, retries: 0 };
  const importer = initializeImporter(script, config);
  const inputPath = script.paths.resolvePath(config.inputFile, Core.GOPathType.INPUT);
  const batchSize = Math.min(config.batchSize, AWS.SQS_MAX_BATCH_SIZE);

  script.logger.section('Processing Messages');
  script.prompt.startSpinner('Reading and sending messages...');

  try {
    let batch: string[] = [];

    for await (const message of importer.importStream(inputPath)) {
      const normalized = normalizeMessage(message);
      if (normalized !== null) batch.push(normalized);

      if (batch.length >= batchSize) {
        await flushBatch(script, config, queueUrl, batch, stats);
        batch = [];
      }
    }

    if (batch.length > 0) {
      await flushBatch(script, config, queueUrl, batch, stats);
    }

    script.prompt.spinnerStop('Processing completed');
  } catch (error) {
    script.prompt.spinnerStop('Processing failed');
    throw error;
  }

  return stats;
}
