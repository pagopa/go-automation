/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
export interface AwsPutSqsConfig {
  /** AWS profile name for SSO authentication */
  readonly awsProfile: string;

  /** SQS queue URL */
  readonly queueUrl?: string;

  /** SQS queue name */
  readonly queueName?: string;

  /** Path to input file */
  readonly inputFile: string;

  /** File format type */
  readonly fileFormat: 'text' | 'json' | 'csv' | 'auto';

  /** CSV column name to extract data */
  readonly csvColumn: string;

  /** SQS batch size */
  readonly batchSize: number;

  /** Delay in seconds for messages */
  readonly delaySeconds: number;

  /** Maximum retries per batch */
  readonly batchMaxRetries: number;

  /** FIFO group ID */
  readonly fifoGroupId?: string;

  /** FIFO deduplication strategy */
  readonly fifoDeduplicationStrategy: 'content' | 'hash';
}
