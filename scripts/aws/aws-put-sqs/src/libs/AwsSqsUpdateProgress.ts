/**
 * AWS Put SQS - Update Progress
 *
 * Updates the spinner with current progress.
 */

import { Core } from '@go-automation/go-common';
import type { BulkStats } from './AwsPutSqsBulkStats.js';

/**
 * Updates the spinner with current progress
 * @param script - Script instance
 * @param stats - Statistics object to update
 */

export function updateProgress(script: Core.GOScript, stats: BulkStats): void {
  script.prompt.updateSpinner(`Sent: ${stats.success} | Failed: ${stats.failed} | Retries: ${stats.retries}`);
}
