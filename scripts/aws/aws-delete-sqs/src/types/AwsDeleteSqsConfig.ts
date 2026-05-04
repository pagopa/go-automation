/**
 * AwsDeleteSqsConfig - Interface for AWS Delete SQS script configuration.
 *
 * This interface defines the configuration parameters for the aws-delete-sqs script,
 * including SQS queue details, message deletion settings, batch processing options.
 */
export interface AwsDeleteSqsConfig {
  /**
   * The AWS SSO profile name to use for authentication.
   * @type {string}
   */
  awsProfile: string;

  /**
   * The name of the SQS queue to delete messages from.
   * Required when queueUrl is not provided.
   * @type {string}
   */
  queueName?: string;

  /**
   * The URL of the SQS queue to delete messages from.
   * Required when queueName is not provided.
   * @type {string}
   */
  queueUrl?: string;

  /**
   * The path to the input file containing messages to delete.
   * The file can be in NDJSON format.
   * @type {string}
   */
  inputFile?: string;

  /**
   * Whether to delete all messages in the queue.
   * @type {boolean}
   */
  purgeAll: boolean;

  /**
   * The visibility timeout in seconds to apply to received messages.
   * Messages will remain invisible to other consumers for this duration.
   * @type {number}
   */
  visibilityTimeout: number;

  /**
   * The number of messages to process in parallel (max 10).
   * @type {number}
   */
  batchSize: number;

  /**
   * The maximum number of consecutive empty receives before the script stops.
   * This acts as a safety mechanism to prevent infinite loops.
   * @type {number}
   */
  maxEmptyReceives: number;
}
