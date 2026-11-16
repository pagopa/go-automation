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
