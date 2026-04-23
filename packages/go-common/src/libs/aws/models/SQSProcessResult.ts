/**
 * SQS Process Result
 */

/**
 * Result of the message consumption and processing loop.
 */
export interface SQSProcessResult {
  /** Total messages received */
  totalReceived: number;

  /** Total messages deleted (success) */
  totalDeleted: number;

  /** Total messages released (visibility 0) */
  totalReleased: number;

  /** Total messages skipped */
  totalSkipped: number;

  /** Reason the loop stopped */
  stopReason: string;
}
