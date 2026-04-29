/**
 * Statistics for a single Dead Letter Queue.
 *
 * @example
 * ```typescript
 * const stats: DLQStats = {
 *   queueName: 'pn-delivery-DLQ',
 *   queueUrl: 'https://sqs.eu-south-1.amazonaws.com/123456789012/pn-delivery-DLQ',
 *   messageCount: 42,
 *   ageOfOldestMessageDays: 3,
 * };
 * ```
 */
export interface DLQStats {
  /** SQS queue name */
  readonly queueName: string;

  /** Full SQS queue URL */
  readonly queueUrl: string;

  /** Approximate number of messages currently in the queue */
  readonly messageCount: number;

  /**
   * Age of the oldest message in days (from CloudWatch).
   * Undefined if no CloudWatch datapoints are available.
   */
  readonly ageOfOldestMessageDays: number | undefined;
}
