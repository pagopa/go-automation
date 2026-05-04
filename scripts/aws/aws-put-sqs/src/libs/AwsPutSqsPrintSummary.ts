/**
 * AWS Put SQS - Print Summary
 */

import { Core } from '@go-automation/go-common';
import type { BulkStats } from './AwsPutSqsBulkStats.js';

/**
 * Log summary of the operation
 * @param script - GOScript instance
 * @param stats - Statistics
 * @param startTime - Start time
 */
export function printSummary(script: Core.GOScript, stats: BulkStats, startTime: number): void {
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  script.logger.section('Operation Summary');
  script.logger.info(`Total processed:   ${stats.processed}`);
  script.logger.success(`Successfully sent: ${stats.success}`);
  if (stats.failed > 0) {
    script.logger.error(`Permanently failed: ${stats.failed}`);
  }
  script.logger.info(`Total retries:     ${stats.retries}`);
  script.logger.info(`Duration:          ${durationSec}s`);
}
