/**
 * AWS Redrive SQS - Main Logic Module
 *
 * Moves messages from a source SQS queue to a target SQS queue.
 * Ensures type parity and preserves attributes during the move.
 */

import { Core, AWS } from '@go-automation/go-common';
import type { AwsRedriveSqsConfig } from './types/index.js';

/**
 * Main script execution function.
 *
 * @param script - The GOScript instance
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<AwsRedriveSqsConfig>();
  script.logger.section('AWS Redrive SQS');

  const sqsService = new AWS.AWSSQSService(script.aws.sqs, script.aws.cloudWatch);

  // Resolve metadata for both queues
  const [sourceMeta, targetMeta] = await Promise.all([
    sqsService.resolveQueueMetadata(config.sourceQueue),
    sqsService.resolveQueueMetadata(config.targetQueue),
  ]);

  // Enforce same-type move
  if (sourceMeta.isFifo !== targetMeta.isFifo) {
    throw new Error(
      `Queue type mismatch: Source is ${sourceMeta.isFifo ? 'FIFO' : 'Standard'}, ` +
        `Target is ${targetMeta.isFifo ? 'FIFO' : 'Standard'}. ` +
        'Moving across types is not supported.',
    );
  }

  script.logger.info(`Source: ${sourceMeta.queueUrl}`);
  script.logger.info(`Target: ${targetMeta.queueUrl}`);

  if (config.dryRun) {
    script.logger.warning('DRY RUN ENABLED - No messages will be sent or deleted.');
  }

  script.logger.newline();
  script.prompt.startSpinner('Redriving messages...');

  // Perform the move using the idiomatic go-common service
  const result = await sqsService.moveMessages(
    {
      sourceQueueUrl: sourceMeta.queueUrl,
      targetQueueUrl: targetMeta.queueUrl,
      isFifo: sourceMeta.isFifo,
      visibilityTimeout: config.visibilityTimeout,
      batchSize: config.batchSize,
      dryRun: config.dryRun,
      ...(config.limit !== undefined ? { limit: config.limit } : {}),
    },
    {
      onProgress: (moved: number, failed: number) => {
        let msg = `${config.dryRun ? 'Dry run: would move' : 'Moved'}: ${moved}`;
        if (failed > 0) msg += ` | Failed: ${failed}`;
        script.prompt.updateSpinner(msg);
      },
    },
  );

  if (result.totalFailed > 0) {
    script.prompt.spinnerWarn(
      `Completed with some issues (${result.stopReason}).\n` +
        `  - Successfully moved: ${result.totalMoved}\n` +
        `  - Permanently failed: ${result.totalFailed}\n` +
        'Failed messages remain in the source queue.',
    );
  } else {
    script.prompt.spinnerStop(`Completed (${result.stopReason}). Total moved: ${result.totalMoved}`);
  }

  if (result.totalFailed > 0) {
    throw new Error(`Redrive finished with ${result.totalFailed} failures.`);
  }
}
