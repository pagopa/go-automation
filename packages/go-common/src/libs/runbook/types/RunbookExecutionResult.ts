import type { KnownCase } from './KnownCase.js';
import type { RunbookContext } from './RunbookContext.js';
import type { ErrorRecoveryInfo } from './ErrorRecoveryInfo.js';
import type { RunbookExecutionTrace } from '../trace/RunbookExecutionTrace.js';

/**
 * Result of a complete runbook execution.
 */
export interface RunbookExecutionResult {
  /** ID of the executed runbook */
  readonly runbookId: string;
  /** Execution status */
  readonly status: 'completed' | 'failed' | 'stopped';
  /** The known case that matched (if any) */
  readonly matchedCase?: KnownCase;
  /** Execution duration in milliseconds */
  readonly durationMs: number;
  /** Number of steps executed */
  readonly stepsExecuted: number;
  /** Final execution context */
  readonly finalContext: RunbookContext;
  /** Recovered errors from steps with continueOnFailure */
  readonly recoveredErrors: ReadonlyArray<ErrorRecoveryInfo>;
  /** Detailed execution trace */
  readonly trace: RunbookExecutionTrace;
  /** Whether the runbook was resolved early via the 'resolve' signal */
  readonly earlyResolution?: boolean;
  /** Step ID that triggered the successful early resolution */
  readonly resolvedAtStep?: string;
}
