/**
 * Result of queue initialization.
 */
export interface QueueInitResult {
  readonly queueUrl: string;
  readonly approxMessages: number;
  readonly isFifo: boolean;
}
