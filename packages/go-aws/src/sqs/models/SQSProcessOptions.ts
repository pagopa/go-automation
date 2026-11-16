/**
 * Configuration options for the message consumption loop.
 */
export interface SQSProcessOptions {
  /** Queue URL to process from */
  queueUrl: string;

  /** Initial visibility timeout for received messages (seconds) */
  visibilityTimeout: number;

  /** Max consecutive empty receives before stopping */
  maxEmptyReceives: number;

  /** (Optional) Max number of messages to process */
  limit?: number | undefined;

  /** (Optional) Number of messages to receive/process per batch (max 10, default 10) */
  batchSize?: number | undefined;

  /** (Optional) Use long polling wait time (default 20s) */
  waitTimeSeconds?: number | undefined;
}
