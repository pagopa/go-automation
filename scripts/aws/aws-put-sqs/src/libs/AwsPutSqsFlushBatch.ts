/**
 * AWS Put SQS - Flush Batch
 */

import { Core } from '@go-automation/go-common';
import type { AwsPutSqsConfig } from '../types/AwsPutSqsConfig.js';
import { processBatch } from './AwsSqsProcessBatch.js';
import { updateProgress } from './AwsSqsUpdateProgress.js';
import type { BulkStats } from './AwsPutSqsBulkStats.js';

/**
 * Flush batch of messages to SQS
 * @param script - GOScript instance
 * @param config - Script configuration
 * @param queueUrl - Queue URL
 * @param batch - Batch of messages
 * @param stats - Statistics
 * @returns Promise
 */
export async function flushBatch(
  script: Core.GOScript,
  config: AwsPutSqsConfig,
  queueUrl: string,
  batch: string[],
  stats: BulkStats,
): Promise<void> {
  await processBatch(script, config, queueUrl, batch, stats);
  updateProgress(script, stats);
}
