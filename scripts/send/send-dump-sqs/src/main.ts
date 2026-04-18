/**
 * SEND Dump SQS - Main Logic Module
 *
 * Read-only dumps all messages from a specified SQS queue in NDJSON format.
 * Messages are received but NOT deleted from the queue.
 *
 * Features:
 * - Long polling (20s) for efficient message retrieval.
 * - Deduplication modes (message-id, content-md5, none).
 * - Multi-pass empty check to ensure queue is truly empty.
 * - Progress estimation and capacity warnings.
 */

import { Core } from '@go-automation/go-common';

import { initializeQueue } from './libs/initializeQueue.js';
import type { SendDumpSqsConfig } from './types/index.js';

/** Long polling wait time */
const WAIT_TIME_SECONDS = 20;

/**
 * Main script execution function.
 *
 * @param script - The GOScript instance for logging and prompts
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<SendDumpSqsConfig>();

  script.logger.section('SEND Dump SQS');

  // Warning if visibility timeout is too short compared to polling strategy
  const pollingWindow = WAIT_TIME_SECONDS * config.maxEmptyReceives;
  if (config.visibilityTimeout < pollingWindow) {
    script.logger.warning(
      `Visibility Timeout (${config.visibilityTimeout}s) is shorter than the polling window (${pollingWindow}s). ` +
        'Messages may reappear and be received again before the dump completes.',
    );
  }

  // Resolve output path
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultOutputFile = `dump_${config.queueName}_${timestamp}.ndjson`;
  const outputFile = config.outputFile ?? defaultOutputFile;
  const outputPathInfo = script.paths.resolvePathWithInfo(outputFile, Core.GOPathType.OUTPUT);

  script.logger.info(`Output file: ${outputPathInfo.path}`);
  script.logger.newline();

  // Resolve queue identifier
  const queueNameOrUrl = config.queueUrl ?? config.queueName;
  if (!queueNameOrUrl) {
    throw new Error('Either queue.name or queue.url must be provided');
  }

  // Initialize queue
  const { queueUrl } = await initializeQueue(
    script.aws.sqs,
    script.aws.cloudWatch,
    queueNameOrUrl,
    script.prompt,
    script.logger,
  );

  // Initialize service
  const sqsService = new Core.AWSSQSService(script.aws.sqs, script.aws.cloudWatch);

  // Dump messages
  script.prompt.startSpinner('Dumping messages...');
  const result = await sqsService.receiveMessages(
    {
      queueUrl,
      dedupMode: config.dedupMode,
      visibilityTimeout: config.visibilityTimeout,
      maxEmptyReceives: config.maxEmptyReceives,
      limit: config.limit ?? undefined,
    },
    {
      onProgress: (unique, total, duplicates) => {
        script.prompt.updateSpinner(`Dumped: ${unique} | Received: ${total} | Duplicates: ${duplicates}`);
      },
      onEmptyReceive: (consecutive, max) => {
        script.prompt.updateSpinner(`Empty receive (${consecutive}/${max})... Still searching...`);
      },
    },
  );

  // Write all collected messages to NDJSON file
  if (result.messages.length > 0) {
    const exporter = new Core.GOJSONListExporter<Core.Message>({
      outputPath: outputPathInfo.path,
      jsonl: true,
    });
    await exporter.export(result.messages);
  }

  script.prompt.spinnerStop(
    `Dump completed (${result.stopReason}).\n` +
      `  - Total unique messages: ${result.totalUnique}\n` +
      `  - Total messages received: ${result.totalReceived}\n` +
      `  - Duplicates filtered: ${result.totalDuplicates}\n` +
      `  - File: ${outputPathInfo.path}`,
  );
}
