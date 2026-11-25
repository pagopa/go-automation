import type { RunbookType } from '../types/RunbookType.js';
import type { RunbookExecutionStatus } from '../types/RunbookExecutionStatus.js';
import type { ExecutionEnvironment } from './ExecutionEnvironment.js';

/**
 * General information about a runbook execution.
 * Includes runbook metadata, timestamps, duration, and execution environment.
 */
export interface ExecutionInfo {
  /** Unique execution ID (UUID) */
  readonly executionId: string;
  /** Runbook ID */
  readonly runbookId: string;
  /** Human-readable runbook name */
  readonly runbookName: string;
  /** Runbook version */
  readonly runbookVersion: string;
  /** Runbook type (see RunbookType) */
  readonly runbookType: RunbookType;
  /** Execution start timestamp (ISO 8601) */
  readonly startedAt: string;
  /** Execution completion timestamp (ISO 8601) */
  readonly completedAt: string;
  /** Total duration in milliseconds */
  readonly durationMs: number;
  /** Final execution status */
  readonly status: RunbookExecutionStatus;
  /** Failure reason (only if status !== 'completed') */
  readonly failureReason?: string;
  /** Execution environment information */
  readonly environment: ExecutionEnvironment;
}
