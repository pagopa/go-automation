/**
 * AwsDumpSqsConfig - Interface for AWS Dump SQS script configuration.
 *
 * This interface defines the configuration parameters for the aws-dump-sqs script,
 * including SQS queue details, file input settings, batch processing options,
 */

import { AWS } from '@go-automation/go-common';

export interface AwsDumpSqsConfig {
  /**
   * The AWS SSO profile name to use for authentication.
   * @type {string}
   */
  readonly awsProfile: string;

  /**
   * The name of the SQS queue to dump messages from.
   * Required when queueUrl is not provided.
   * @type {string}
   */
  readonly queueName?: string;

  /**
   * The URL of the SQS queue to dump messages from.
   * Required when queueName is not provided.
   * @type {string}
   */
  readonly queueUrl?: string;

  /**
   * The visibility timeout in seconds to apply to received messages.
   * Messages will remain invisible to other consumers for this duration.
   * @type {number}
   */
  readonly visibilityTimeout: number;

  /**
   * The maximum number of messages to dump from the queue.
   * If undefined, the script will continue dumping until the queue is empty or maxEmptyReceives is reached.
   * @type {number | undefined}
   */
  readonly limit: number | undefined;

  /**
   * The deduplication mode to use when receiving messages.
   * @type {'content' | 'hash'}
   */
  readonly dedupMode: AWS.SQSReceiveDeduplicationMode;

  /**
   * The number of consecutive empty receives before the script stops dumping.
   * This acts as a safety mechanism to prevent infinite loops.
   * @type {number}
   */
  readonly maxEmptyReceives: number;

  /**
   * The path to the output file where the dumped messages will be written.
   * If undefined, messages will be written to standard output (stdout).
   * @type {string | undefined}
   */
  readonly outputFile: string | undefined;
}
