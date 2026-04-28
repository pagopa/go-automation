/**
 * SQS Move Result
 */

export interface SQSMoveResult {
  /** Total messages successfully moved to target */
  readonly totalMoved: number;

  /** Total messages that failed to be sent to target or deleted from source */
  readonly totalFailed: number;

  /** Reason the move operation stopped */
  readonly stopReason: string;
}
