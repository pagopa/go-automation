/**
 * Send Delete SQS - Main Logic Module
 *
 * Implements resilient message deletion from SQS.
 *
 * Features:
 * - Targeted deletion using NDJSON input file (matches by MessageId).
 * - Full queue purge with mandatory interactive confirmation.
 * - Dynamic visibility release (visibility = 0) for non-matched messages.
 * - Long polling and batch operations for efficiency.
 */

import { Core, AWS } from '@go-automation/go-common';
import type { SendDeleteSqsConfig } from './types/SendDeleteSqsConfig.js';

/**
 * Main script execution function.
 *
 * @param script - The GOScript instance
 */
export async function main(script: Core.GOScript): Promise<void> {
  const configValues = await script.getConfiguration<SendDeleteSqsConfig>();

  script.logger.section('SEND Delete SQS');

  // 1. Validation
  if (!configValues.purgeAll && !configValues.inputFile) {
    throw new Error('Either --purge-all or --input-file must be provided');
  }

  // 2. Resolve queue URL
  const queueNameOrUrl = configValues.queueUrl ?? configValues.queueName;
  if (!queueNameOrUrl) {
    throw new Error('Either --queue-name or --queue-url must be provided');
  }

  const sqsService = new AWS.AWSSQSService(script.aws.sqs, script.aws.cloudWatch);
  const metadata = await sqsService.resolveQueueMetadata(queueNameOrUrl);
  const queueUrl = metadata.queueUrl;

  script.logger.info(`Target Queue: ${queueUrl}`);

  // 3. Load target MessageIds if in targeted mode
  let targetIds: Set<string> | undefined;
  if (configValues.inputFile) {
    script.logger.info(`Loading target messages from: ${configValues.inputFile}`);
    const inputPath = script.paths.resolvePath(configValues.inputFile, Core.GOPathType.INPUT);
    const importer = new Core.GOJSONListImporter<AWS.Message>({
      jsonl: true,
    });
    const result = await importer.import(inputPath);
    targetIds = new Set(
      result.items.map((m: AWS.Message) => m.MessageId).filter((id: string | undefined): id is string => !!id),
    );
    script.logger.info(`Loaded ${targetIds.size} unique MessageIds to delete.`);
  }

  // 4. Mandatory Confirmation
  const actionDescription = configValues.purgeAll
    ? 'PURGE ALL messages'
    : `DELETE ${targetIds?.size ?? 0} specific messages`;

  const confirmed = await script.prompt.confirm(
    `Are you sure you want to ${actionDescription} from queue "${metadata.queueUrl}"?`,
    false,
  );

  if (!confirmed) {
    script.logger.warning('Operation cancelled by user.');
    return;
  }

  // 5. Execution Loop
  script.logger.section('Executing Deletions');
  script.prompt.startSpinner('Processing messages...');

  const result = await sqsService.processMessages(
    {
      queueUrl,
      visibilityTimeout: configValues.visibilityTimeout,
      maxEmptyReceives: configValues.maxEmptyReceives,
      limit: targetIds?.size,
    },
    (message) => {
      // Determine action
      if (configValues.purgeAll) {
        return AWS.SQSProcessAction.DELETE;
      }

      if (message.MessageId && targetIds?.has(message.MessageId)) {
        return AWS.SQSProcessAction.DELETE;
      }

      // If not matching, release immediately to keep queue clean for others
      return AWS.SQSProcessAction.RELEASE;
    },
    {
      onProgress: (received, deleted, released, skipped) => {
        script.prompt.updateSpinner(
          `Received: ${received} | Deleted: ${deleted} | Released: ${released} | Skipped: ${skipped}`,
        );
      },
      onEmptyReceive: (consecutive, max) => {
        script.prompt.updateSpinner(`Empty receive (${consecutive}/${max})... Still searching...`);
      },
    },
  );

  script.prompt.spinnerStop(`Operation completed (${result.stopReason}).`);

  // 6. Summary
  script.logger.section('Operation Summary');
  script.logger.info(`Total Received: ${result.totalReceived}`);
  script.logger.success(`Total Deleted:  ${result.totalDeleted}`);
  script.logger.info(`Total Released: ${result.totalReleased}`);
  script.logger.info(`Total Skipped:  ${result.totalSkipped}`);

  if (!configValues.purgeAll && targetIds && result.totalDeleted < targetIds.size) {
    script.logger.warning(
      `Warning: Only ${result.totalDeleted} out of ${targetIds.size} requested messages were found and deleted.`,
    );
  }
}
