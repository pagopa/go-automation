/**
 * A single row in the DLQ report output file.
 * Flat structure that combines profile and queue information.
 */
export interface DLQReportRow {
  /** AWS profile name */
  readonly profile: string;

  /** SQS queue name */
  readonly queueName: string;

  /** Approximate number of messages currently in the queue */
  readonly messageCount: number;

  /** Age of the oldest message in days, or 'N/A' if not available */
  readonly ageOfOldestMessageDays: number | string;
}
