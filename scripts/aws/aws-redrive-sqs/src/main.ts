/**
 * AWS Redrive SQS - Main Logic Module
 *
 * Moves messages from a source SQS queue to a target SQS queue.
 * Ensures type parity and preserves attributes during the move.
 */

import { Core, AWS } from '@go-automation/go-common';
import type { AwsRedriveSqsConfig } from './types/index.js';

/**
 * Main script execution flow:
 *
 * 1. CLI parameter ranges are validated by per-parameter `validator` functions
 *    declared in `config.ts`; out-of-range values throw before `main()` runs.
 * 2. Resolve metadata for source and target queues; refuse if they coincide
 *    or if their FIFO/Standard types disagree.
 * 3. Move messages reporting per-message errors via `onError` callback.
 * 4. Print a breakdown distinguishing moved / send-failed (safe) /
 *    delete-failed (duplicates at risk) / validation rejected.
 * 5. Throw on any failure → `index.ts` catches it and exits non-zero.
 *
 * @param script - The GOScript instance providing config, AWS clients, and prompts
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

  // Guard against accidental same-queue redrive (would loop forever)
  if (sourceMeta.queueUrl === targetMeta.queueUrl) {
    throw new Error(
      `Source and target resolve to the same queue (${AWS.SQSUtils.redactQueueUrl(sourceMeta.queueUrl)}). Refusing to redrive.`,
    );
  }

  // Enforce same-type move
  if (sourceMeta.isFifo !== targetMeta.isFifo) {
    throw new Error(
      `Queue type mismatch: Source is ${sourceMeta.isFifo ? 'FIFO' : 'Standard'}, ` +
        `Target is ${targetMeta.isFifo ? 'FIFO' : 'Standard'}. ` +
        'Moving across types is not supported.',
    );
  }

  // Account ID redacted from logs to avoid leaking it into shared output (CI, tickets).
  script.logger.info(`Source: ${AWS.SQSUtils.redactQueueUrl(sourceMeta.queueUrl)}`);
  script.logger.info(`Target: ${AWS.SQSUtils.redactQueueUrl(targetMeta.queueUrl)}`);

  if (config.dryRun) {
    script.logger.warning('DRY RUN ENABLED - No messages will be sent or deleted.');
  }

  script.logger.newline();
  script.prompt.startSpinner('Redriving messages...');

  const result = await sqsService.moveMessages(
    {
      sourceQueueUrl: sourceMeta.queueUrl,
      targetQueueUrl: targetMeta.queueUrl,
      isFifo: sourceMeta.isFifo,
      visibilityTimeout: config.visibilityTimeout,
      batchSize: config.batchSize,
      maxEmptyReceives: config.maxEmptyReceives,
      concurrency: config.concurrency,
      dryRun: config.dryRun,
      ...(config.limit !== undefined ? { limit: config.limit } : {}),
    },
    {
      onProgress: (moved: number, sendFailed: number, deleteFailed: number) => {
        const action = config.dryRun ? 'Dry run: would move' : 'Moved';
        const sendSuffix = sendFailed > 0 ? ` | Send failed: ${sendFailed}` : '';
        const deleteSuffix = deleteFailed > 0 ? ` | Delete failed (DUPLICATES): ${deleteFailed}` : '';
        script.prompt.updateSpinner(`${action}: ${moved}${sendSuffix}${deleteSuffix}`);
      },
      onEmptyReceive: (consecutive: number, max: number) => {
        script.prompt.updateSpinner(`Polling empty queue (${String(consecutive)}/${String(max)})...`);
      },
    },
  );

  if (result.totalFailed > 0) {
    script.prompt.spinnerWarn(
      `Completed with issues (${result.stopReason}).\n` +
        `  - Successfully moved: ${result.totalMoved}\n` +
        `  - Send failed (still on source — safe): ${result.totalSendFailed}\n` +
        `  - Delete failed (DUPLICATE on source AND target): ${result.totalDeleteFailed}\n` +
        `  - Validation rejected (still on source): ${result.totalValidationFailed}`,
    );

    if (result.errors.length > 0) {
      script.logger.section('Per-message errors');
      for (const err of result.errors) {
        const idPart = err.messageId !== undefined ? ` ${err.messageId}` : '';
        script.logger.error(`[${err.stage}]${idPart}: ${err.error}`);
      }
    }

    throw new Error(`Redrive finished with ${result.totalFailed} failures.`);
  }

  script.prompt.spinnerStop(`Completed (${result.stopReason}). Total moved: ${result.totalMoved}`);
}
