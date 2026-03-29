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

import {
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  type QueueAttributeName,
} from '@aws-sdk/client-sqs';
import { Core } from '@go-automation/go-common';
import * as fs from 'node:fs';

import { SendDumpSqsDedupMode, type SendDumpSqsConfig } from './config.js';

/** Max messages per receive (SQS limit) */
const MAX_BATCH_SIZE = 10;

/** Long polling wait time */
const WAIT_TIME_SECONDS = 20;

/**
 * Main script execution function.
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

  const sqsClient = script.aws.sqs;

  try {
    // Get Queue URL and Attributes
    script.prompt.spin('init', `Initializing dump for queue "${config.queueName}"...`);
    let queueUrl: string;
    try {
      const getUrlResponse = await sqsClient.send(new GetQueueUrlCommand({ QueueName: config.queueName }));
      if (getUrlResponse.QueueUrl === undefined) {
        throw new Error(`Queue URL not found for "${config.queueName}"`);
      }
      queueUrl = getUrlResponse.QueueUrl;

      const isFifoByName = config.queueName.endsWith('.fifo');
      const attributeNames: QueueAttributeName[] = ['ApproximateNumberOfMessages'];
      if (isFifoByName) {
        attributeNames.push('FifoQueue');
      }

      const getAttrResponse = await sqsClient.send(
        new GetQueueAttributesCommand({
          QueueUrl: queueUrl,
          AttributeNames: attributeNames,
        }),
      );

      const isFifo = isFifoByName || getAttrResponse.Attributes?.FifoQueue === 'true';
      const approxMessages = parseInt(getAttrResponse.Attributes?.ApproximateNumberOfMessages ?? '0', 10);
      const inFlightLimit = isFifo ? 20000 : 120000;

      script.prompt.spinSucceed(
        'init',
        `Queue initialized. Approx. messages: ${approxMessages}${isFifo ? ' (FIFO)' : ''}`,
      );

      if (approxMessages > inFlightLimit) {
        script.logger.warning(
          `Queue size (${approxMessages}) exceeds SQS in-flight message limit (${inFlightLimit}). ` +
            'Dumping without deleting will stop once the limit is reached.',
        );
      }
    } catch (error) {
      script.prompt.spinFail(
        'init',
        `Failed to initialize queue: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }

    // Dump loop state
    let totalReceived = 0;
    let totalDumped = 0;
    let totalDuplicates = 0;
    let consecutiveEmptyReceives = 0;
    const seenKeys = new Set<string>();

    script.prompt.startSpinner('Dumping messages...');

    while (consecutiveEmptyReceives < config.maxEmptyReceives) {
      // Check limit
      if (config.limit !== undefined && totalDumped >= config.limit) {
        break;
      }

      // Calculate next batch size
      let nextBatchSize = MAX_BATCH_SIZE;
      if (config.limit !== undefined) {
        const remaining = config.limit - totalDumped;
        nextBatchSize = Math.min(MAX_BATCH_SIZE, remaining);
      }

      const receiveResponse = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: nextBatchSize,
          VisibilityTimeout: config.visibilityTimeout,
          WaitTimeSeconds: WAIT_TIME_SECONDS,
          AttributeNames: ['All'],
          MessageAttributeNames: ['All'],
        }),
      );

      const messages = receiveResponse.Messages ?? [];

      if (messages.length === 0) {
        consecutiveEmptyReceives++;
        script.prompt.updateSpinner(
          `Empty receive (${consecutiveEmptyReceives}/${config.maxEmptyReceives})... Still searching...`,
        );
        continue;
      }

      // Process messages and count unique
      let newMessagesInBatch = 0;
      for (const message of messages) {
        let isDuplicate = false;

        if (config.dedupMode !== SendDumpSqsDedupMode.NONE) {
          let dedupKey: string | undefined;

          if (config.dedupMode === SendDumpSqsDedupMode.MESSAGE_ID) {
            dedupKey = message.MessageId;
          } else if (config.dedupMode === SendDumpSqsDedupMode.CONTENT_MD5) {
            dedupKey = `${message.MD5OfBody ?? ''}:${message.MD5OfMessageAttributes ?? ''}`;
          }

          if (dedupKey !== undefined) {
            if (seenKeys.has(dedupKey)) {
              isDuplicate = true;
            } else {
              seenKeys.add(dedupKey);
            }
          }
        }

        if (isDuplicate) {
          totalDuplicates++;
        } else {
          // Append to NDJSON file
          fs.appendFileSync(outputPathInfo.path, `${JSON.stringify(message)}\n`, 'utf-8');
          totalDumped++;
          newMessagesInBatch++;
        }
      }

      totalReceived += messages.length;

      if (newMessagesInBatch > 0) {
        // Reset empty counter only if we found NEW unique messages
        consecutiveEmptyReceives = 0;
      } else {
        // If we got messages but all were duplicates, treat it as a "non-productive" poll
        consecutiveEmptyReceives++;
        script.prompt.updateSpinner(
          `Only duplicates received (${consecutiveEmptyReceives}/${config.maxEmptyReceives})... Still searching...`,
        );
      }

      script.prompt.updateSpinner(
        `Dumped: ${totalDumped} | Received: ${totalReceived} | Duplicates: ${totalDuplicates}`,
      );
    }

    const stopReason =
      config.limit !== undefined && totalDumped >= config.limit
        ? 'reached limit'
        : `queue empty after ${config.maxEmptyReceives} polls`;

    script.prompt.spinnerStop(
      `Dump completed (${stopReason}).\n` +
        `  - Total unique messages: ${totalDumped}\n` +
        `  - Total messages received: ${totalReceived}\n` +
        `  - Duplicates filtered: ${totalDuplicates}\n` +
        `  - File: ${outputPathInfo.path}`,
    );
  } catch (error) {
    script.logger.error(`Error during dump: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
