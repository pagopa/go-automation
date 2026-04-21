import type { CaseAction } from '../actions/CaseAction.js';

export type ActionType = 'log' | 'notify' | 'update' | 'escalate' | 'composite' | 'fallback';

/**
 * Trace of the action executed after known case matching.
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
  readonly status: 'success' | 'failed';
  /** Error message (only if status === 'failed') */
  readonly error?: string;
  /** Action execution duration in milliseconds */
  readonly durationMs: number;
}
