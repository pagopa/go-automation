import type { LogEntry } from './LogEntry.js';
import type { ErrorRecoveryInfo } from './ErrorRecoveryInfo.js';
import type { GORegexCache } from '@pagopa/go-common/utils';
import type { WorkflowServices } from './WorkflowServices.js';

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
  /** Log entries collected during execution */
  readonly logs: ReadonlyArray<LogEntry>;
  /** Services of the execution: WorkflowServices, or an operational extension of them */
  readonly services: TServices;
  /** Errors recovered from steps with continueOnFailure enabled. Allows inspection of which steps failed without blocking execution. */
  readonly recoveredErrors: ReadonlyArray<ErrorRecoveryInfo>;
  /** Abort signal for cancelling the execution. Propagated to all service calls. */
  readonly signal?: AbortSignal;
  /** Compiled-regex cache of the engine running this context; absent in contexts built by hand, which compile without caching. */
  readonly regexCache?: GORegexCache;
}
