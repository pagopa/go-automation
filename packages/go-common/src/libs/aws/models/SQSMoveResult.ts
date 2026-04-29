import type { SQSMoveError } from './SQSMoveError.js';

/**
 * Result of `AWSSQSService.moveMessages`.
 */
export interface SQSMoveResult {
  /** Total messages successfully moved (sent to target AND deleted from source) */
  readonly totalMoved: number;

  /**
   * Total messages that did NOT make it to the target. Sum of:
   * - {@link totalSendFailed} (messages still on source — safe)
   * - {@link totalDeleteFailed} (messages on BOTH source and target — duplicates at risk)
   * - validation rejections
   */
  readonly totalFailed: number;

  /** Messages that failed to be sent to target. They remain on source — safe. */
  readonly totalSendFailed: number;

  /**
   * Messages successfully sent to target but NOT deleted from source.
   * They will be redelivered on the next consumer poll → duplicates at risk.
   * The operator should verify the target queue and either tolerate duplicates
   * or implement idempotent processing.
   */
  readonly totalDeleteFailed: number;

  /** Messages rejected by pre-send validation (e.g. empty body, missing FIFO group). */
  readonly totalValidationFailed: number;

  /** Per-message error records for diagnostics */
  readonly errors: ReadonlyArray<SQSMoveError>;

  /** Reason the move operation stopped */
  readonly stopReason: string;
}
