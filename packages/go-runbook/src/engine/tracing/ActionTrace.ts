import type { CaseAction } from '../types/CaseAction.js';
import type { ActionType } from './ActionType.js';
import type { TraceStatus } from './TraceStatus.js';

/**
 * Trace of the action executed after known error matching.
 * Documents the action type, result, and duration.
 */
export interface ActionTrace {
  /** Whether an action was actually executed */
  readonly executed: boolean;
  /** Type of the action executed */
  readonly actionType: ActionType;
  /** Full action detail (see CaseAction) */
  readonly actionDetail: CaseAction;
  /** Message with resolved variables (interpolated template) */
  readonly resolvedMessage?: string;
  /** Action execution status */
  readonly status: TraceStatus;
  /** Error message (only if status === 'failed') */
  readonly error?: string;
  /** Action execution duration in milliseconds */
  readonly durationMs: number;
}
