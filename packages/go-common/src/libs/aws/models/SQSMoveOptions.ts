/**
 * Configuration for `AWSSQSService.moveMessages`.
 */
export interface SQSMoveOptions {
  /** Source queue URL */
  readonly sourceQueueUrl: string;

  /** Target queue URL */
  readonly targetQueueUrl: string;

  /** Whether the queues are FIFO */
  readonly isFifo: boolean;

  /** Visibility timeout for received messages (seconds, ignored in dry-run where it is forced to 0) */
  readonly visibilityTimeout: number;

  /** Batch size for receive/send operations (clamped to 1-10 by the service) */
  readonly batchSize: number;

  /** Whether to perform a dry run (receive only, no send/delete; uses VisibilityTimeout: 0) */
  readonly dryRun: boolean;

  /** Maximum number of messages to move */
  readonly limit?: number;

  /**
   * Maximum number of consecutive empty receives before the loop terminates.
   * With long polling at 20s, each empty receive blocks up to that long, so a
   * higher value increases the total wind-down time. Defaults to 3.
   */
  readonly maxEmptyReceives?: number;

  /**
   * Worker pool concurrency: how many receive→send→delete pipelines run in
   * parallel. Defaults to 1 (sequential, original behaviour). Higher values
   * improve throughput on large redrives but increase API load on both queues.
   */
  readonly concurrency?: number;
}
