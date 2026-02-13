import type { ExecutionInfo } from './ExecutionInfo.js';
import type { StepTrace } from './StepTrace.js';
import type { CaseMatchingTrace } from './CaseMatchingTrace.js';
import type { ActionTrace } from './ActionTrace.js';
import type { ExecutionSummary } from './ExecutionSummary.js';

/**
 * Complete execution trace of a runbook run.
 * Contains detailed information about each step, case matching, and actions.
 */
export interface RunbookExecutionTrace {
  /** Execution metadata */
  readonly execution: ExecutionInfo;
  /** Per-step traces in execution order */
  readonly steps: ReadonlyArray<StepTrace>;
  /** Case matching evaluation traces */
  readonly caseMatching: ReadonlyArray<CaseMatchingTrace>;
  /** Action execution trace */
  readonly action?: ActionTrace;
  /** High-level execution summary */
  readonly summary: ExecutionSummary;
}
