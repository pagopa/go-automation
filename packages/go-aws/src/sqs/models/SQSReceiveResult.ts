import type { Message } from '@aws-sdk/client-sqs';

/**
 * Result of a bulk SQS receive operation.
 */
export interface SQSReceiveResult {
  /** All unique messages collected */
  readonly messages: ReadonlyArray<Message>;

  /** Total messages returned by SQS API calls */
  readonly totalReceived: number;

  /** Total unique messages after deduplication */
  readonly totalUnique: number;

  /** Number of duplicate messages filtered out */
  readonly totalDuplicates: number;

  /** Reason why the reception loop stopped */
  readonly stopReason: string;
}
