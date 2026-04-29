/**
 * SQS Handlers
 *
 * Aggregated `type` aliases for SQS callback handlers and supporting unions.
 * Grouped here intentionally because each is a one-line function signature
 * (or string union) and splitting them across one-line files added more
 * navigation cost than benefit. All `interface` and `enum` declarations
 * remain in their own dedicated files.
 */

import type { Message } from '@aws-sdk/client-sqs';

import type { SQSMoveError } from './SQSMoveError.js';
import type { SQSProcessAction } from './SQSProcessAction.js';

/**
 * Callback invoked between retries of a batched SQS send.
 *
 * @param failedCount - How many entries are about to be retried in the next attempt
 * @param attempt - 1-based attempt number being scheduled
 */
export type SQSBatchRetryHandler = (failedCount: number, attempt: number) => void;

/**
 * Progress callback for `AWSSQSService.receiveMessages`.
 *
 * @param unique - Count of unique messages collected so far
 * @param total - Total messages received from SQS (includes duplicates)
 * @param duplicates - Messages skipped due to deduplication
 */
export type SQSReceiveProgressHandler = (unique: number, total: number, duplicates: number) => void;

/**
 * Callback invoked when a Receive call returns no messages.
 *
 * @param consecutive - Consecutive empty receives counted so far
 * @param max - Threshold at which the loop will terminate
 */
export type SQSReceiveEmptyReceiveHandler = (consecutive: number, max: number) => void;

/**
 * Progress callback for `AWSSQSService.processMessages`.
 *
 * @param received - Total messages received so far
 * @param deleted - Messages whose handler returned DELETE
 * @param released - Messages whose handler returned RELEASE
 * @param skipped - Messages whose handler returned SKIP (or unknown action)
 */
export type SQSProcessProgressHandler = (received: number, deleted: number, released: number, skipped: number) => void;

/**
 * Handler invoked for each message in `AWSSQSService.processMessages`.
 * The returned `SQSProcessAction` decides whether the message is deleted,
 * released back to the queue, or skipped.
 */
export type SQSMessageHandler = (message: Message) => SQSProcessAction | Promise<SQSProcessAction>;

/**
 * Progress callback for `AWSSQSService.moveMessages`.
 *
 * @param moved - Messages successfully sent to target AND deleted from source
 * @param sendFailed - Messages that failed to be sent (still on source — safe)
 * @param deleteFailed - Messages sent to target but not deleted from source (DUPLICATE risk)
 * @param validationFailed - Messages rejected before send (still on source)
 */
export type SQSMoveProgressHandler = (
  moved: number,
  sendFailed: number,
  deleteFailed: number,
  validationFailed: number,
) => void;

/**
 * Per-message error callback for `AWSSQSService.moveMessages`. Invoked
 * inline as each error is captured so consumers can stream diagnostics
 * without waiting for the full result.
 */
export type SQSMoveErrorHandler = (error: SQSMoveError) => void;

/**
 * The stage of a move operation where a per-message error occurred.
 *
 * - `validation`: pre-send check failed (e.g. FIFO message without MessageGroupId,
 *   empty body). The message stays on the source queue.
 * - `send`: SendMessageBatch failed for this message after all retries.
 *   The message stays on the source queue (safe).
 * - `delete`: SendMessageBatch succeeded but DeleteMessageBatch failed for this
 *   message. **The message exists on BOTH source and target queues** — it will
 *   be redelivered on the next consumer poll (duplicate at risk).
 * - `unknown`: catch-all for unexpected errors (e.g. throttling, IAM, KMS).
 */
export type SQSMoveErrorStage = 'validation' | 'send' | 'delete' | 'unknown';
