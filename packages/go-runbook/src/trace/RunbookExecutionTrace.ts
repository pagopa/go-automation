import type { ExecutionInfo } from './ExecutionInfo.js';
import type { StepTrace } from './StepTrace.js';
import type { CaseMatchingTrace } from './CaseMatchingTrace.js';
import type { ActionTrace } from './ActionTrace.js';
import type { ExecutionSummary } from './ExecutionSummary.js';

/**
 * Structured trace of a complete runbook execution.
 * Produced by the engine at the end of every execution.
 * Contains all information needed for audit, debugging, and LLM analysis.
 *
 * @example
 * ```typescript
 * const result = await engine.execute(runbook, params, services);
 * const trace = result.trace;
 * await s3.putObject({ Key: `traces/${trace.execution.executionId}.json`, Body: JSON.stringify(trace) });
 * ```
 */
export interface RunbookExecutionTrace {
  /** Schema version for forward compatibility */
  readonly schemaVersion: '1.0.0';
  /** General execution information */
  readonly execution: ExecutionInfo;
  /** Input parameters provided to the runbook */
  readonly input: Readonly<Record<string, string>>;
  /** Trace of each step executed in the pipeline */
  readonly pipeline: ReadonlyArray<StepTrace>;
  /** Final state of variables at the end of execution */
  readonly variables: Readonly<Record<string, string>>;
  /** Detail of known case matching */
  readonly caseMatching: CaseMatchingTrace;
  /**
   * Detail of every executed action, in the order they ran.
   * For multi-match scenarios this contains one entry per matched
   * case (sorted by priority desc) plus the fallback when no case
   * matched.
   */
  readonly actionsExecuted: ReadonlyArray<ActionTrace>;
  /** Synthetic execution summary */
  readonly summary: ExecutionSummary;
}
