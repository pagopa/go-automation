import type { KnownCaseDetection } from './KnownCaseDetection.js';
import type { CoverageEntry } from './CoverageEntry.js';
import type { ObservedErrors } from './ObservedErrors.js';
import type { RunbookContext } from './RunbookContext.js';
import type { ErrorRecoveryInfo } from './ErrorRecoveryInfo.js';
import type { RunbookExecutionStatus } from './RunbookExecutionStatus.js';
import type { RunbookExecutionTrace } from '../tracing/RunbookExecutionTrace.js';
import type { ErrorTreeNode } from './ErrorTreeNode.js';
import type { TreeChainGroup } from './TreeChainGroup.js';

/**
 * Result of a complete runbook execution.
 */
export interface RunbookExecutionResult {
  /** ID of the executed runbook */
  readonly runbookId: string;
  /** Execution status */
  readonly status: RunbookExecutionStatus;
  /**
   * Every known case that matched the final context, ordered by `firstSeenAt` (declaration order on ties, untimed
   * detections last). Empty when no case matched and the fallback ran instead.
   */
  readonly detections: ReadonlyArray<KnownCaseDetection>;
  /** Partial evidence declared by the steps, or recorded by the engine for a failed read. */
  readonly coverage: ReadonlyArray<CoverageEntry>;
  readonly windowIncomplete: boolean;
  /** Errors observed and examined, as last declared by a step; absent when no step enumerates errors. */
  readonly observedErrors?: ObservedErrors;
  /** Nodes of the error tree, parents before children; absent for a window-level runbook. */
  readonly tree?: ReadonlyArray<ErrorTreeNode>;
  /** Final context of every node of the error tree, by node id; absent for a window-level runbook. */
  readonly nodeContexts?: ReadonlyMap<string, RunbookContext>;
  /** Chains of the error tree, grouped, in time order; absent for a window-level runbook. */
  readonly chains?: ReadonlyArray<TreeChainGroup>;
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
}
