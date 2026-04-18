/**
 * AWS SQS Service
 *
 * Provides methods for SQS operations including DLQ inspection,
 * queue metadata resolution, and resilient batch sending.
 */

import * as crypto from 'node:crypto';
import {
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  ListQueuesCommand,
  SendMessageBatchCommand,
} from '@aws-sdk/client-sqs';
import type {
  SQSClient,
  SendMessageBatchRequestEntry,
  SendMessageBatchCommandOutput,
  QueueAttributeName,
} from '@aws-sdk/client-sqs';
import { GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import type { CloudWatchClient } from '@aws-sdk/client-cloudwatch';

import type { DLQStats } from './models/DLQStats.js';
import type { SQSQueueMetadata } from './models/SQSQueueMetadata.js';

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

    const attributeNames: QueueAttributeName[] = ['ApproximateNumberOfMessages', 'FifoQueue'];
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
    options: { maxRetries: number; onRetry?: (failedCount: number, attempt: number) => void } = { maxRetries: 3 },
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
