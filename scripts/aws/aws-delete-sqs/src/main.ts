/**
 * AWS Delete SQS - Main Logic Module
 *
 * Implements resilient message deletion from SQS.
 */

import { Core, AWS } from '@go-automation/go-common';
import type { AwsDeleteSqsConfig } from './types/AwsDeleteSqsConfig.js';

/**
 * Main script execution function.
 *
 * @param script - The GOScript instance
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<AwsDeleteSqsConfig>();
  script.logger.section('AWS Delete SQS');

  // 1. Validation
  if (!config.purgeAll && !config.inputFile) {
    throw new Error('Either --purge-all or --input-file must be provided');
  }

  // 2. Resolve queue URL
  const queueNameOrUrl = config.queueUrl ?? config.queueName;
  if (!queueNameOrUrl) {
    throw new Error('Either --queue-name or --queue-url must be provided');
  }

  const sqsService = new AWS.AWSSQSService(script.aws.sqs, script.aws.cloudWatch);
  const metadata = await sqsService.resolveQueueMetadata(queueNameOrUrl);
  const queueUrl = metadata.queueUrl;

  script.logger.info(`Target Queue: ${queueUrl}`);

  // 3. Load target MessageIds if in targeted mode
  let targetIds: Set<string> | undefined;
  if (config.inputFile) {
    script.logger.info(`Loading target messages from: ${config.inputFile}`);
    const inputPath = script.paths.resolvePath(config.inputFile, Core.GOPathType.INPUT);
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
  const actionDescription = config.purgeAll ? 'PURGE ALL messages' : `DELETE ${targetIds?.size ?? 0} specific messages`;

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
      visibilityTimeout: config.visibilityTimeout,
      maxEmptyReceives: config.maxEmptyReceives,
      limit: targetIds?.size,
      batchSize: config.batchSize,
    },
    (message) => {
      // Determine action
      if (config.purgeAll) {
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

  if (!config.purgeAll && targetIds && result.totalDeleted < targetIds.size) {
    script.logger.warning(
      `Warning: Only ${result.totalDeleted} out of ${targetIds.size} requested messages were found and deleted.`,
    );
  }
}
