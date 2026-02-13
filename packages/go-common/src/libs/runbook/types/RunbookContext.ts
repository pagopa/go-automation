import type { LogEntry } from './LogEntry.js';
import type { ErrorRecoveryInfo } from './ErrorRecoveryInfo.js';
import type { ServiceRegistry } from '../services/ServiceRegistry.js';

/**
 * Immutable execution context of the runbook.
 * Updated (via copy) after each step execution.
 */
export interface RunbookContext {
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
  /** Injected AWS and HTTP services */
  readonly services: ServiceRegistry;
  /**
   * (v5) Errors recovered from steps with continueOnFailure enabled.
   * Allows inspection of which steps failed without blocking execution.
   */
  readonly recoveredErrors: ReadonlyArray<ErrorRecoveryInfo>;
}
