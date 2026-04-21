/**
 * Configuration for the SEND Delete SQS script.
 */
export interface SendDeleteSqsConfig {
  /** AWS Profile for SSO login */
  awsProfile: string;

  /** SQS Queue Name */
  queueName?: string;

  /** SQS Queue URL (overrides queueName) */
  queueUrl?: string;

  /** Input NDJSON file with messages to delete */
  inputFile?: string;

  /** Whether to delete all messages in the queue */
  purgeAll: boolean;

  /** Initial visibility timeout for received messages (seconds) */
  visibilityTimeout: number;

  /** Number of messages to process in parallel (max 10) */
  batchSize: number;

  /** Max consecutive empty receives before stopping */
  maxEmptyReceives: number;
}
