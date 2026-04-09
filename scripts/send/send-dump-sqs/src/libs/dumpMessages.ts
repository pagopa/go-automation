/**
 * SQS message dump loop with deduplication and progress reporting.
 */

import { ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import type { Message } from '@aws-sdk/client-sqs';
import { Core } from '@go-automation/go-common';

import { SendDumpSqsDedupMode } from '../types/index.js';

/** Max messages per receive (SQS limit) */
const MAX_BATCH_SIZE = 10;

/** Long polling wait time */
const WAIT_TIME_SECONDS = 20;

/**
 * Result of the dump operation.
 */
interface DumpResult {
  readonly messages: ReadonlyArray<Message>;
  readonly totalReceived: number;
  readonly totalDumped: number;
  readonly totalDuplicates: number;
  readonly stopReason: string;
}

/**
 * Options for the dump loop.
 */
interface DumpOptions {
  readonly queueUrl: string;
  readonly dedupMode: SendDumpSqsDedupMode;
  readonly visibilityTimeout: number;
  readonly maxEmptyReceives: number;
  readonly limit?: number | undefined;
}

/**
 * Extracts the deduplication key from a message based on the configured mode.
 *
 * @param message - SQS message
 * @param dedupMode - Deduplication strategy
 * @returns Dedup key string, or undefined if mode is NONE
 */
function getDedupKey(message: Message, dedupMode: SendDumpSqsDedupMode): string | undefined {
  switch (dedupMode) {
    case SendDumpSqsDedupMode.MESSAGE_ID:
      return message.MessageId;
    case SendDumpSqsDedupMode.CONTENT_MD5:
      return `${message.MD5OfBody ?? ''}:${message.MD5OfMessageAttributes ?? ''}`;
    case SendDumpSqsDedupMode.NONE:
      return undefined;
    default: {
      const exhaustive: never = dedupMode;
      throw new Error(`Unknown dedup mode: ${String(exhaustive)}`);
    }
  }
}

/**
 * Dumps all messages from an SQS queue using long polling with deduplication.
 * Messages are received but NOT deleted.
 *
 * @param sqsClient - AWS SQS client from GOScript
 * @param options - Dump configuration
 * @param prompt - GOPrompt for spinner feedback
 * @returns Dump results with messages and statistics
 */
export async function dumpMessages(
  sqsClient: Core.GOScript['aws']['sqs'],
  options: DumpOptions,
  prompt: Core.GOPrompt,
): Promise<DumpResult> {
  let totalReceived = 0;
  let totalDumped = 0;
  let totalDuplicates = 0;
  let consecutiveEmptyReceives = 0;
  const seenKeys = new Set<string>();
  const dumpedMessages: Message[] = [];

  prompt.startSpinner('Dumping messages...');

  while (consecutiveEmptyReceives < options.maxEmptyReceives) {
    if (options.limit !== undefined && totalDumped >= options.limit) {
      break;
    }

    const nextBatchSize =
      options.limit !== undefined ? Math.min(MAX_BATCH_SIZE, options.limit - totalDumped) : MAX_BATCH_SIZE;

    const receiveResponse = await sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: options.queueUrl,
        MaxNumberOfMessages: nextBatchSize,
        VisibilityTimeout: options.visibilityTimeout,
        WaitTimeSeconds: WAIT_TIME_SECONDS,
        AttributeNames: ['All'],
        MessageAttributeNames: ['All'],
      }),
    );

    const messages = receiveResponse.Messages ?? [];

    if (messages.length === 0) {
      consecutiveEmptyReceives++;
      prompt.updateSpinner(
        `Empty receive (${consecutiveEmptyReceives}/${options.maxEmptyReceives})... Still searching...`,
      );
      continue;
    }

    let newMessagesInBatch = 0;
    for (const message of messages) {
      const dedupKey = getDedupKey(message, options.dedupMode);
      const isDuplicate = dedupKey !== undefined && seenKeys.has(dedupKey);

      if (dedupKey !== undefined && !isDuplicate) {
        seenKeys.add(dedupKey);
      }

      if (isDuplicate) {
        totalDuplicates++;
      } else {
        dumpedMessages.push(message);
        totalDumped++;
        newMessagesInBatch++;
      }
    }

    totalReceived += messages.length;

    if (newMessagesInBatch > 0) {
      consecutiveEmptyReceives = 0;
    } else {
      consecutiveEmptyReceives++;
      prompt.updateSpinner(
        `Only duplicates received (${consecutiveEmptyReceives}/${options.maxEmptyReceives})... Still searching...`,
      );
    }

    prompt.updateSpinner(`Dumped: ${totalDumped} | Received: ${totalReceived} | Duplicates: ${totalDuplicates}`);
  }

  const stopReason =
    options.limit !== undefined && totalDumped >= options.limit
      ? 'reached limit'
      : `queue empty after ${options.maxEmptyReceives} polls`;

  return { messages: dumpedMessages, totalReceived, totalDumped, totalDuplicates, stopReason };
}
