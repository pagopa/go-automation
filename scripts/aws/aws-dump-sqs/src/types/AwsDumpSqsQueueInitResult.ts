/**
 * QueueInitResult - Interface for SQS queue initialization result.
 *
 * This interface defines the result of the queue initialization process,
 * providing essential information about the queue configuration and content.
 */
export interface QueueInitResult {
  /**
   * The URL of the initialized SQS queue.
   * @type {string}
   */
  readonly queueUrl: string;

  /**
   * The approximate number of messages currently in the queue.
   * This value may be approximate and can fluctuate.
   * @type {number}
   */
  readonly approxMessages: number;

  /**
   * Flag indicating whether the queue is a FIFO (First-In, First-Out) queue.
   * @type {boolean}
   */
  readonly isFifo: boolean;
}
