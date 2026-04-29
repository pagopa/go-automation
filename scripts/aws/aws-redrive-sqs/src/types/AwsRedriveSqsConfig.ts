/**
 * Configuration for the AWS Redrive SQS script.
 */
export interface AwsRedriveSqsConfig {
  /** AWS SSO profile name */
  readonly awsProfile: string;

  /** Source SQS queue name or URL */
  readonly sourceQueue: string;

  /** Target SQS queue name or URL */
  readonly targetQueue: string;

  /** Maximum number of messages to move */
  readonly limit?: number;

  /** Simulate the move without actual sending/deleting */
  readonly dryRun: boolean;

  /** Visibility timeout for received messages (seconds) */
  readonly visibilityTimeout: number;

  /** Batch size for SQS operations (1-10) */
  readonly batchSize: number;

  /** Max consecutive empty receives before the loop terminates (default 3) */
  readonly maxEmptyReceives: number;

  /** Worker pool concurrency for parallel batch processing (default 1) */
  readonly concurrency: number;
}
