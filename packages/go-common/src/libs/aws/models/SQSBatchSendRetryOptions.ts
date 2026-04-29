import type { SQSBatchRetryHandler } from './SQSHandlers.js';

/**
 * Configuration for `AWSSQSService.sendMessageBatchWithRetries`.
 */
export interface SQSBatchSendRetryOptions {
  /** Maximum number of retry attempts for partial-failure entries */
  readonly maxRetries: number;

  /** Optional callback invoked before each retry attempt */
  readonly onRetry?: SQSBatchRetryHandler;
}
