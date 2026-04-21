/**
 * SQS Queue Metadata
 */
export interface SQSQueueMetadata {
  /** Full SQS Queue URL */
  readonly queueUrl: string;
  /** True if the queue is a FIFO queue */
  readonly isFifo: boolean;
  /** Approximate number of visible messages in the queue */
  readonly approxMessages: number;
}
