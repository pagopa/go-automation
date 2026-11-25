import type { ReadSplitBudget } from './ReadSplitBudget.js';
import type { ErrorRecoveryInfo } from './ErrorRecoveryInfo.js';
import type { GORegexCache } from '@pagopa/go-common/utils';
import type { WorkflowServices } from './WorkflowServices.js';
import type { RunbookReads } from './RunbookReads.js';
import type { ReadPolicy } from './ReadPolicy.js';

/**
 * Immutable execution context of the runbook.
 * Updated (via copy) after each step execution.
 *
 * @typeParam TServices - Services of the execution (operational toolkits use their registry)
 */
export interface RunbookContext<TServices extends WorkflowServices = WorkflowServices> {
  /** Unique ID of the current execution */
  readonly executionId: string;
  /** Execution start timestamp */
  readonly startedAt: Date;
  /** Step results indexed by stepId */
  readonly stepResults: ReadonlyMap<string, unknown>;
  /** Variables extracted during execution (traceId, errorCode, etc.) */
  readonly vars: ReadonlyMap<string, string>;
  /** Runbook input parameters (alarmName, timeRange, etc.) */
  readonly params: ReadonlyMap<string, string>;
  /** Services of the execution: WorkflowServices, or an operational extension of them */
  readonly services: TServices;
  /** Errors recovered from steps with continueOnFailure enabled. Allows inspection of which steps failed without blocking execution. */
  readonly recoveredErrors: ReadonlyArray<ErrorRecoveryInfo>;
  /** Abort signal for cancelling the execution. Propagated to all service calls. */
  readonly signal?: AbortSignal;
  /** Compiled-regex cache of the engine running this context; absent in contexts built by hand, which compile without caching. */
  readonly regexCache?: GORegexCache;
  /**
   * The state of the reads so far, seen from this context, so a step that derives a value from earlier reads can tell
   * a complete read from a partial one. Only the engine records.
   */
  readonly reads: RunbookReads;
  /**
   * Whether a read may keep what it got when part of it fails (`partial`), as an alarm analysis does, or must fail
   * as a whole (`strict`), as a procedure needs. Absent means `strict`.
   */
  readonly readPolicy?: ReadPolicy;
  /**
   * Reads of the window a step makes once for the whole execution, by key, shared by every node of an error tree
   * (for example a probe every request may need). Created by each execution, never shared between executions.
   */
  readonly sharedReads?: Map<string, Promise<unknown>>;
  readonly readSplits?: ReadSplitBudget;
  readonly readFailures?: Map<string, number>;
}
