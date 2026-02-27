/**
 * AWS SQS Service for DLQ inspection
 *
 * Provides methods to list Dead Letter Queues and retrieve their statistics,
 * combining SQS attributes with CloudWatch metrics for a complete picture.
 */

import { GetQueueAttributesCommand, ListQueuesCommand } from '@aws-sdk/client-sqs';
import type { SQSClient } from '@aws-sdk/client-sqs';
import { GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import type { CloudWatchClient } from '@aws-sdk/client-cloudwatch';

import type { DLQStats } from './models/DLQStats.js';

/** Time window for CloudWatch metrics (5 minutes) */
const CLOUDWATCH_WINDOW_MS = 5 * 60 * 1000;

/** CloudWatch period in seconds */
const CLOUDWATCH_PERIOD_SECONDS = 300;

/** Seconds in a day */
const SECONDS_PER_DAY = 24 * 60 * 60;

/** Max results per ListQueues page */
const LIST_QUEUES_PAGE_SIZE = 1000;

/**
 * Service for inspecting SQS Dead Letter Queues.
 *
 * Combines SQS queue attributes with CloudWatch metrics to provide
 * a complete view of DLQ health per AWS account/profile.
 *
 * @example
 * ```typescript
 * const service = new AWSSQSService(clientProvider.sqs, clientProvider.cloudWatch);
 * const stats = await service.listDLQsWithStats();
 * for (const dlq of stats) {
 *   console.log(`${dlq.queueName}: ${dlq.messageCount} messages (${dlq.ageOfOldestMessageDays ?? 'N/A'} days old)`);
 * }
 * ```
 */
export class AWSSQSService {
  constructor(
    private readonly sqsClient: SQSClient,
    private readonly cloudWatchClient: CloudWatchClient,
  ) {}

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
