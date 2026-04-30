import type { SQSMoveErrorStage } from './SQSHandlers.js';

/**
 * Per-message error captured during a redrive operation.
 */
export interface SQSMoveError {
  /** Stage where the failure happened */
  readonly stage: SQSMoveErrorStage;

  /** SQS message identifier (when available) */
  readonly messageId?: string;

  /** Human-readable error message */
  readonly error: string;
}
