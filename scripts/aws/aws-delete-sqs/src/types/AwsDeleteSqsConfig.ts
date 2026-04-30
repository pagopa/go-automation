/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
export interface AwsDeleteSqsConfig {
  /** AWS profile name for SSO authentication */
  readonly awsProfile: string;

  /** SQS Queue Name */
  readonly queueName?: string;

  /** SQS Queue URL (overrides queueName) */
  readonly queueUrl?: string;

  /** Input NDJSON file with messages to delete */
  readonly inputFile?: string;

  /** Whether to delete all messages in the queue */
  readonly purgeAll: boolean;

  /** Initial visibility timeout for received messages (seconds) */
  readonly visibilityTimeout: number;

  /** Number of messages to process in parallel (max 10) */
  readonly batchSize: number;

  /** Max consecutive empty receives before stopping */
  readonly maxEmptyReceives: number;
}
