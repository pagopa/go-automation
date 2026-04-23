/**
 * AWS SQS Service
 *
 * Provides methods for SQS operations including DLQ inspection,
 * queue metadata resolution, and resilient batch sending.
 */

import * as crypto from 'node:crypto';
import {
  ChangeMessageVisibilityBatchCommand,
  DeleteMessageBatchCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  ListQueuesCommand,
  ReceiveMessageCommand,
  SendMessageBatchCommand,
} from '@aws-sdk/client-sqs';
import type {
  SQSClient,
  SendMessageBatchRequestEntry,
  SendMessageBatchCommandOutput,
  QueueAttributeName,
  Message,
  DeleteMessageBatchCommandOutput,
  ChangeMessageVisibilityBatchCommandOutput,
} from '@aws-sdk/client-sqs';
import { GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import type { CloudWatchClient } from '@aws-sdk/client-cloudwatch';

import type { DLQStats } from './models/DLQStats.js';
import type { SQSQueueMetadata } from './models/SQSQueueMetadata.js';
import { SQSReceiveDeduplicationMode } from './models/SQSReceiveDeduplicationMode.js';
import type { SQSReceiveResult } from './models/SQSReceiveResult.js';
import { SQSProcessAction } from './models/SQSProcessAction.js';
import type { SQSProcessOptions } from './models/SQSProcessOptions.js';
import type { SQSProcessResult } from './models/SQSProcessResult.js';
import { SQS_MAX_BATCH_SIZE } from './SQSUtils.js';

/** Time window for CloudWatch metrics (5 minutes) */
const CLOUDWATCH_WINDOW_MS = 5 * 60 * 1000;

/** CloudWatch period in seconds */
const CLOUDWATCH_PERIOD_SECONDS = 300;

/** Seconds in a day */
const SECONDS_PER_DAY = 24 * 60 * 60;

/** Max results per ListQueues page */
const LIST_QUEUES_PAGE_SIZE = 1000;

/** Default batch retry delay (ms) */
const DEFAULT_RETRY_DELAY_MS = 500;

/** Long polling wait time in seconds */
const LONG_POLLING_WAIT_TIME = 20;

type SQSBatchRetryHandler = (failedCount: number, attempt: number) => void;

interface SQSBatchSendRetryOptions {
  readonly maxRetries: number;
  readonly onRetry?: SQSBatchRetryHandler;
}

interface SQSReceiveOptions {
  readonly queueUrl: string;
  readonly visibilityTimeout: number;
  readonly maxEmptyReceives: number;
  readonly dedupMode: SQSReceiveDeduplicationMode;
  readonly limit?: number | undefined;
  readonly batchSize?: number | undefined;
}

type SQSReceiveProgressHandler = (unique: number, total: number, duplicates: number) => void;

type SQSReceiveEmptyReceiveHandler = (consecutive: number, max: number) => void;

interface SQSReceiveCallbacks {
  readonly onProgress?: SQSReceiveProgressHandler;
  readonly onEmptyReceive?: SQSReceiveEmptyReceiveHandler;
}

type SQSProcessProgressHandler = (received: number, deleted: number, released: number, skipped: number) => void;

type SQSMessageHandler = (message: Message) => SQSProcessAction | Promise<SQSProcessAction>;

interface SQSProcessCallbacks {
  readonly onProgress?: SQSProcessProgressHandler;
  readonly onEmptyReceive?: SQSReceiveEmptyReceiveHandler;
}

/**
 * Service for interacting with Amazon SQS.
 *
 * Provides high-level methods for common operational tasks like DLQ health
 * checks and robust bulk message sending.
 */
export class AWSSQSService {
  constructor(
    private readonly sqsClient: SQSClient,
    private readonly cloudWatchClient: CloudWatchClient,
  ) {}

  /**
   * Resolves queue metadata including URL, FIFO status, and message count.
   *
   * Accepts either a full queue URL or just the queue name.
   *
   * @param queueNameOrUrl - Queue name or URL
   * @returns Queue metadata
   */
  async resolveQueueMetadata(queueNameOrUrl: string): Promise<SQSQueueMetadata> {
    const queueUrl = queueNameOrUrl.startsWith('https://')
      ? queueNameOrUrl
      : (await this.sqsClient.send(new GetQueueUrlCommand({ QueueName: queueNameOrUrl }))).QueueUrl;

    if (!queueUrl) {
      throw new Error(`Could not resolve SQS queue URL for: ${queueNameOrUrl}`);
    }

    // FifoQueue attribute is only valid for FIFO queues (.fifo suffix is mandatory)
    const isLikelyFifo = queueUrl.endsWith('.fifo');
    const attributeNames: QueueAttributeName[] = isLikelyFifo
      ? ['ApproximateNumberOfMessages', 'FifoQueue']
      : ['ApproximateNumberOfMessages'];

    const response = await this.sqsClient.send(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: attributeNames,
      }),
    );

    return {
      queueUrl,
      isFifo: response.Attributes?.FifoQueue === 'true',
      approxMessages: parseInt(response.Attributes?.ApproximateNumberOfMessages ?? '0', 10),
    };
  }

  /**
   * Sends a batch of messages with surgical retries for partial failures.
   *
   * Only messages that failed in the previous attempt (reported in the `Failed` array)
   * are retried, preventing duplicates in standard queues.
   *
   * @param queueUrl - Target queue URL
   * @param entries - Batch of message entries
   * @param options - Retry configuration
   * @returns Final command output after all retries
   */
  async sendMessageBatchWithRetries(
    queueUrl: string,
    entries: SendMessageBatchRequestEntry[],
    options: SQSBatchSendRetryOptions = { maxRetries: 3 },
  ): Promise<SendMessageBatchCommandOutput> {
    let currentEntries = [...entries];
    let attempt = 0;
    let finalResponse: SendMessageBatchCommandOutput | undefined;

    while (currentEntries.length > 0) {
      const response = await this.sqsClient.send(
        new SendMessageBatchCommand({
          QueueUrl: queueUrl,
          Entries: currentEntries,
        }),
      );

      finalResponse = response;

      if (!response.Failed || response.Failed.length === 0) {
        break;
      }

      if (attempt < options.maxRetries) {
        attempt++;
        const failedIds = new Set(response.Failed.map((f) => f.Id).filter((id): id is string => !!id));
        currentEntries = currentEntries.filter((e) => e.Id !== undefined && failedIds.has(e.Id));

        options.onRetry?.(currentEntries.length, attempt);

        const delay = Math.pow(2, attempt) * DEFAULT_RETRY_DELAY_MS;
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        break;
      }
    }

    if (!finalResponse) {
      throw new Error('No response received from SQS batch send');
    }

    return finalResponse;
  }

  /**
   * Deletes a batch of messages from a queue.
   *
   * @param queueUrl - Target queue URL
   * @param receiptHandles - List of receipt handles to delete
   * @returns Command output
   */
  async deleteMessageBatch(queueUrl: string, receiptHandles: string[]): Promise<DeleteMessageBatchCommandOutput> {
    if (receiptHandles.length === 0) {
      throw new Error('No receipt handles provided for deletion');
    }

    return await this.sqsClient.send(
      new DeleteMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: receiptHandles.map((handle, index) => ({
          Id: `msg-${index}`,
          ReceiptHandle: handle,
        })),
      }),
    );
  }

  /**
   * Changes the visibility timeout of a batch of messages.
   *
   * @param queueUrl - Target queue URL
   * @param entries - List of receipt handles and their new visibility timeout
   * @returns Command output
   */
  async changeMessageVisibilityBatch(
    queueUrl: string,
    entries: { receiptHandle: string; visibilityTimeout: number }[],
  ): Promise<ChangeMessageVisibilityBatchCommandOutput> {
    if (entries.length === 0) {
      throw new Error('No entries provided for visibility change');
    }

    return await this.sqsClient.send(
      new ChangeMessageVisibilityBatchCommand({
        QueueUrl: queueUrl,
        Entries: entries.map((e, index) => ({
          Id: `msg-${index}`,
          ReceiptHandle: e.receiptHandle,
          VisibilityTimeout: e.visibilityTimeout,
        })),
      }),
    );
  }

  /**
   * Receives messages from a queue in bulk using long polling and deduplication.
   *
   * @param options - Receive configuration
   * @param callbacks - Optional progress callbacks
   * @returns Reception results including unique messages
   */
  async receiveMessages(options: SQSReceiveOptions, callbacks?: SQSReceiveCallbacks): Promise<SQSReceiveResult> {
    let totalReceived = 0;
    let totalUnique = 0;
    let totalDuplicates = 0;
    let consecutiveEmptyReceives = 0;
    const seenKeys = new Set<string>();
    const uniqueMessages: Message[] = [];

    while (consecutiveEmptyReceives < options.maxEmptyReceives) {
      if (options.limit !== undefined && totalUnique >= options.limit) {
        break;
      }

      const nextBatchSize =
        options.limit !== undefined ? Math.min(SQS_MAX_BATCH_SIZE, options.limit - totalUnique) : SQS_MAX_BATCH_SIZE;

      const receiveResponse = await this.sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: options.queueUrl,
          MaxNumberOfMessages: nextBatchSize,
          VisibilityTimeout: options.visibilityTimeout,
          WaitTimeSeconds: LONG_POLLING_WAIT_TIME,
          AttributeNames: ['All'],
          MessageAttributeNames: ['All'],
        }),
      );

      const messages = receiveResponse.Messages ?? [];

      if (messages.length === 0) {
        consecutiveEmptyReceives++;
        callbacks?.onEmptyReceive?.(consecutiveEmptyReceives, options.maxEmptyReceives);
        continue;
      }

      let newMessagesInBatch = 0;
      for (const message of messages) {
        const dedupKey = this.getReceiveDedupKey(message, options.dedupMode);
        const isDuplicate = dedupKey !== undefined && seenKeys.has(dedupKey);

        if (dedupKey !== undefined && !isDuplicate) {
          seenKeys.add(dedupKey);
        }

        if (isDuplicate) {
          totalDuplicates++;
        } else {
          uniqueMessages.push(message);
          totalUnique++;
          newMessagesInBatch++;
        }
      }

      totalReceived += messages.length;

      if (newMessagesInBatch > 0) {
        consecutiveEmptyReceives = 0;
      } else {
        consecutiveEmptyReceives++;
      }

      callbacks?.onProgress?.(totalUnique, totalReceived, totalDuplicates);
    }

    const stopReason =
      options.limit !== undefined && totalUnique >= options.limit
        ? 'reached limit'
        : `queue empty after ${options.maxEmptyReceives} polls`;

    return { messages: uniqueMessages, totalReceived, totalUnique, totalDuplicates, stopReason };
  }

  /**
   * Consumes and processes messages from a queue in a resilient loop.
   *
   * Automatically handles:
   * - Long polling (WaitTimeSeconds = 20)
   * - Batch deletion (DELETE action)
   * - Batch visibility reset (RELEASE action)
   * - Progress tracking
   *
   * @param options - Loop configuration
   * @param processor - Callback for each message returning the action to take
   * @param callbacks - Optional progress callbacks
   * @returns Processing statistics
   */
  async processMessages(
    options: SQSProcessOptions,
    processor: SQSMessageHandler,
    callbacks?: SQSProcessCallbacks,
  ): Promise<SQSProcessResult> {
    let totalReceived = 0;
    let totalDeleted = 0;
    let totalReleased = 0;
    let totalSkipped = 0;
    let consecutiveEmptyReceives = 0;

    const waitTime = options.waitTimeSeconds ?? LONG_POLLING_WAIT_TIME;

    while (consecutiveEmptyReceives < options.maxEmptyReceives) {
      if (options.limit !== undefined && totalReceived >= options.limit) {
        break;
      }

      const nextBatchSize =
        options.limit !== undefined ? Math.min(SQS_MAX_BATCH_SIZE, options.limit - totalReceived) : SQS_MAX_BATCH_SIZE;

      const receiveResponse = await this.sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: options.queueUrl,
          MaxNumberOfMessages: nextBatchSize,
          VisibilityTimeout: options.visibilityTimeout,
          WaitTimeSeconds: waitTime,
          AttributeNames: ['All'],
          MessageAttributeNames: ['All'],
        }),
      );

      const messages = receiveResponse.Messages ?? [];

      if (messages.length === 0) {
        consecutiveEmptyReceives++;
        callbacks?.onEmptyReceive?.(consecutiveEmptyReceives, options.maxEmptyReceives);
        continue;
      }

      consecutiveEmptyReceives = 0;
      totalReceived += messages.length;

      const toDelete: string[] = [];
      const toRelease: string[] = [];

      for (const message of messages) {
        const action = await processor(message);

        switch (action) {
          case SQSProcessAction.DELETE:
            if (message.ReceiptHandle) toDelete.push(message.ReceiptHandle);
            totalDeleted++;
            break;
          case SQSProcessAction.RELEASE:
            if (message.ReceiptHandle) toRelease.push(message.ReceiptHandle);
            totalReleased++;
            break;
          case SQSProcessAction.SKIP:
            totalSkipped++;
            break;
          default:
            totalSkipped++;
            break;
        }
      }

      // Execute batch actions
      if (toDelete.length > 0) {
        await this.deleteMessageBatch(options.queueUrl, toDelete);
      }
      if (toRelease.length > 0) {
        await this.changeMessageVisibilityBatch(
          options.queueUrl,
          toRelease.map((h) => ({ receiptHandle: h, visibilityTimeout: 0 })),
        );
      }

      callbacks?.onProgress?.(totalReceived, totalDeleted, totalReleased, totalSkipped);
    }

    const stopReason =
      options.limit !== undefined && totalReceived >= options.limit
        ? 'reached limit'
        : `queue empty after ${options.maxEmptyReceives} polls`;

    return { totalReceived, totalDeleted, totalReleased, totalSkipped, stopReason };
  }

  /**
   * Computes a SHA-256 fingerprint of a message body.
   * Useful for MessageDeduplicationId in FIFO queues.
   *
   * @param body - Message body
   * @returns Hex digest of the body hash
   */
  computeMessageFingerprint(body: string): string {
    return crypto.createHash('sha256').update(body).digest('hex');
  }

  /**
   * Extracts the deduplication key from a received message.
   */
  private getReceiveDedupKey(message: Message, dedupMode: SQSReceiveDeduplicationMode): string | undefined {
    switch (dedupMode) {
      case SQSReceiveDeduplicationMode.MESSAGE_ID:
        return message.MessageId;
      case SQSReceiveDeduplicationMode.CONTENT_MD5:
        return `${message.MD5OfBody ?? ''}:${message.MD5OfMessageAttributes ?? ''}`;
      case SQSReceiveDeduplicationMode.NONE:
        return undefined;
      default:
        return undefined;
    }
  }

  /**
   * Lists all DLQs in the account that contain messages, with statistics.
   *
   * Fetches all queues whose name contains "DLQ", then for each one:
   * - Reads `ApproximateNumberOfMessages` from SQS attributes
   * - If messages > 0, reads `ApproximateAgeOfOldestMessage` from CloudWatch
   *
   * Complexity: O(N) where N is the number of DLQs with messages
   *
   * @returns Array of DLQ statistics, sorted by queue name
   */
  async listDLQsWithStats(): Promise<ReadonlyArray<DLQStats>> {
    const dlqUrls = await this.listAllDLQUrls();
    const results: DLQStats[] = [];

    for (const queueUrl of dlqUrls) {
      const queueName = queueUrl.substring(queueUrl.lastIndexOf('/') + 1);
      const messageCount = await this.getQueueMessageCount(queueUrl);

      if (messageCount > 0) {
        const ageOfOldestMessageDays = await this.getAgeOfOldestMessageDays(queueName);
        results.push({ queueName, queueUrl, messageCount, ageOfOldestMessageDays });
      }
    }

    return results.sort((a, b) => a.queueName.localeCompare(b.queueName));
  }

  /**
   * Lists all SQS queue URLs whose name contains "DLQ".
   * Handles pagination automatically.
   *
   * @returns Sorted array of DLQ queue URLs
   */
  private async listAllDLQUrls(): Promise<ReadonlyArray<string>> {
    const urls: string[] = [];
    let nextToken: string | undefined;

    do {
      const command = new ListQueuesCommand({
        QueueNamePrefix: '',
        MaxResults: LIST_QUEUES_PAGE_SIZE,
        NextToken: nextToken,
      });
      const response = await this.sqsClient.send(command);

      const dlqs = (response.QueueUrls ?? []).filter((url) => url.includes('DLQ'));
      urls.push(...dlqs);
      nextToken = response.NextToken;
    } while (nextToken !== undefined);

    return urls;
  }

  /**
   * Gets the approximate number of messages in a queue.
   *
   * @param queueUrl - Full SQS queue URL
   * @returns Approximate message count, or 0 if attribute is unavailable
   */
  private async getQueueMessageCount(queueUrl: string): Promise<number> {
    const command = new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ['ApproximateNumberOfMessages'],
    });
    const response = await this.sqsClient.send(command);
    const raw = response.Attributes?.['ApproximateNumberOfMessages'];
    return raw !== undefined ? parseInt(raw, 10) : 0;
  }

  /**
   * Gets the age of the oldest message in a queue (in days) from CloudWatch.
   *
   * Queries `ApproximateAgeOfOldestMessage` metric for the last 5 minutes
   * and returns the maximum value converted from seconds to days.
   *
   * @param queueName - SQS queue name (not the URL)
   * @returns Age in days, or undefined if no CloudWatch datapoints are available
   */
  private async getAgeOfOldestMessageDays(queueName: string): Promise<number | undefined> {
    const endTime = new Date();
    const startTime = new Date(Date.now() - CLOUDWATCH_WINDOW_MS);

    const command = new GetMetricStatisticsCommand({
      Namespace: 'AWS/SQS',
      MetricName: 'ApproximateAgeOfOldestMessage',
      Dimensions: [{ Name: 'QueueName', Value: queueName }],
      StartTime: startTime,
      EndTime: endTime,
      Period: CLOUDWATCH_PERIOD_SECONDS,
      Statistics: ['Maximum'],
      Unit: 'Seconds',
    });

    const response = await this.cloudWatchClient.send(command);

    if (response.Datapoints === undefined || response.Datapoints.length === 0) {
      return undefined;
    }

    const maxSeconds = response.Datapoints.reduce((max, dp) => Math.max(max, dp.Maximum ?? 0), 0);
    return Math.floor(maxSeconds / SECONDS_PER_DAY);
  }
}
