/**
 * SQS Move Options
 */

export interface SQSMoveOptions {
  /** Source queue URL */
  readonly sourceQueueUrl: string;

  /** Target queue URL */
  readonly targetQueueUrl: string;

  /** Whether the queues are FIFO */
  readonly isFifo: boolean;

  /** Visibility timeout for received messages (seconds) */
  readonly visibilityTimeout: number;

  /** Batch size for receive/send operations (max 10) */
  readonly batchSize: number;

  /** Whether to perform a dry run (receive only, no send/delete) */
  readonly dryRun: boolean;

  /** Maximum number of messages to move */
  readonly limit?: number;
}
