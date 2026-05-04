/**
 * AWS Put SQS - Main Logic Module
 *
 * Implements bulk message sending to SQS with surgical retries for partial batch failures.
 * Supports text, JSON, and CSV input formats.
 */

import { Core } from '@go-automation/go-common';

import type { AwsPutSqsConfig } from './types/AwsPutSqsConfig.js';
import { resolveQueue, streamMessages, printSummary } from './libs/index.js';

/**
 * Main script execution function
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<AwsPutSqsConfig>();
  script.logger.section('AWS Put SQS');
  /*
   * Resolve queue URL
   */
  const { queueUrl } = await resolveQueue(script, config);
  /*
   * Stream messages and send them to SQS
   */
  const stats = await streamMessages(script, config, queueUrl);
  /*
   * Print summary
   */
  printSummary(script, stats, Date.now());

  if (stats.failed > 0) {
    throw new Error(`Completed with ${stats.failed} permanent failures.`);
  }
}
