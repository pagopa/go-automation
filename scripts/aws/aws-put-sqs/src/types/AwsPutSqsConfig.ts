/**
 * AwsPutSqsConfig - Interface for AWS Put SQS script configuration.
 *
 * This interface defines the configuration parameters for the aws-put-sqs script,
 * including SQS queue details, file input settings, batch processing options,
 * and FIFO (First-In, First-Out) queue settings.
 */
export interface AwsPutSqsConfig {
  /**
   * The URL of the SQS queue.
   * Required when queueName is not provided.
   * @type {string}
   */
  readonly queueUrl?: string;

  /**
   * The name of the SQS queue.
   * Required when queueUrl is not provided.
   * @type {string}
   */
  readonly queueName?: string;

  /**
   * The path to the input file containing messages.
   * The file can be in text, JSON, or CSV format.
   * @type {string}
   */
  readonly inputFile: string;

  /**
   * The format of the input file.
   * Supported values: 'text', 'json', 'csv', or 'auto' (auto-detect).
   * @type {'text' | 'json' | 'csv' | 'auto'}
   */
  readonly fileFormat: 'text' | 'json' | 'csv' | 'auto';

  /**
   * The name of the column to use for message bodies when the file format is CSV.
   * Only applicable when fileFormat is 'csv' or 'auto'.
   * @type {string}
   */
  readonly csvColumn: string;

  /**
   * The number of messages to send in each batch.
   * Must be between 1 and 10 (inclusive).
   * @type {number}
   */
  readonly batchSize: number;

  /**
   * The delay in seconds to wait between batches.
   * This allows controlling the rate of messages sent to the queue.
   * @type {number}
   */
  readonly delaySeconds: number;

  /**
   * The maximum number of retries for each batch operation.
   * @type {number}
   */
  readonly batchMaxRetries: number;

  /**
   * The message group ID for FIFO (First-In, First-Out) queues.
   * Required when using FIFO queues to maintain message order within a group.
   * @type {string}
   */
  readonly fifoGroupId?: string;

  /**
   * The deduplication strategy for FIFO queues.
   * 'content' - Deduplicates messages based on message content hash
   * 'hash' - Deduplicates messages based on explicit hash value
   * @type {'content' | 'hash'}
   */
  readonly fifoDeduplicationStrategy: 'content' | 'hash';
}
