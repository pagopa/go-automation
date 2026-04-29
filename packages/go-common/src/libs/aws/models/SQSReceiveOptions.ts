import type { SQSReceiveDeduplicationMode } from './SQSReceiveDeduplicationMode.js';

/**
 * Configuration for `AWSSQSService.receiveMessages`.
 */
export interface SQSReceiveOptions {
  /** Source queue URL */
  readonly queueUrl: string;

  /** Visibility timeout (seconds) applied to each Receive call */
  readonly visibilityTimeout: number;

  /** Maximum consecutive empty receives before stopping */
  readonly maxEmptyReceives: number;

  /** How received messages should be deduplicated */
  readonly dedupMode: SQSReceiveDeduplicationMode;

  /** Optional cap on the number of unique messages to collect */
  readonly limit?: number | undefined;

  /** Optional batch size override (clamped to SQS max of 10) */
  readonly batchSize?: number | undefined;
}
