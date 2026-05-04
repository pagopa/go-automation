/**
 * AWS Delete SQS - Main Logic Module
 */

import { Core, AWS } from '@go-automation/go-common';
import type { AwsDeleteSqsConfig } from './types/index.js';
import {
  confirmAction,
  loadTargetIds,
  logSummary,
  runDeletion,
  validateConfig,
  resolveQueueIdentifier,
} from './libs/index.js';

/**
 * Main script execution function.
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<AwsDeleteSqsConfig>();

  script.logger.section('AWS Delete SQS');

  validateConfig(config);

  const sqsService = new AWS.AWSSQSService(script.aws.sqs, script.aws.cloudWatch);
  const queueIdentifier = resolveQueueIdentifier(config);
  const metadata = await sqsService.resolveQueueMetadata(queueIdentifier);
  script.logger.info(`Target Queue: ${metadata.queueUrl}`);

  const targetIds = await loadTargetIds(config, script);

  const confirmed = await confirmAction(config, metadata, targetIds, script);
  if (!confirmed) {
    script.logger.warning('Operation cancelled by user.');
    return;
  }

  script.logger.section('Executing Deletions');
  const result = await runDeletion(sqsService, config, metadata.queueUrl, targetIds, script);

  logSummary(result, targetIds, config, script);
}
