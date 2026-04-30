import { AWS } from '@go-automation/go-common';

/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
export interface AwsDumpSqsConfig {
  /** AWS profile name for SSO authentication */
  readonly awsProfile: string;

  /** Target SQS queue name */
  readonly queueName?: string;

  /** Target SQS queue URL */
  readonly queueUrl?: string;

  /** Visibility timeout for received messages */
  readonly visibilityTimeout: number;

  /** Maximum number of messages to dump */
  readonly limit?: number;

  /** Deduplication strategy */
  readonly dedupMode: AWS.SQSReceiveDeduplicationMode;

  /** Number of consecutive empty polls before stopping */
  readonly maxEmptyReceives: number;

  /** Output file path */
  readonly outputFile?: string;
}
