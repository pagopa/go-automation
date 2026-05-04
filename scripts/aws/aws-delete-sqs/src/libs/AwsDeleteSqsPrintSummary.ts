/**
 * AWS Delete SQS - Print Summary Library
 */

import { Core, AWS } from '@go-automation/go-common';
import type { AwsDeleteSqsConfig } from '../types/index.js';

/**
 * Prints summary of the operation
 * @param result - Result of the operation
 * @param targetIds - Set of message IDs to delete
 * @param config - Configuration for the script
 * @param script - Script instance
 */

export function printSummary(
  result: AWS.SQSProcessResult,
  targetIds: Set<string> | undefined,
  config: AwsDeleteSqsConfig,
  script: Core.GOScript,
): void {
  script.logger.section('Operation Summary');
  script.logger.info(`Total Received: ${result.totalReceived}`);
  script.logger.success(`Total Deleted:  ${result.totalDeleted}`);
  script.logger.info(`Total Released: ${result.totalReleased}`);
  script.logger.info(`Total Skipped:  ${result.totalSkipped}`);

  const deletedFewer = !config.purgeAll && targetIds && result.totalDeleted < targetIds.size;
  if (deletedFewer) {
    script.logger.warning(
      `Warning: Only ${result.totalDeleted} out of ${targetIds.size} requested messages were found and deleted.`,
    );
  }
}
