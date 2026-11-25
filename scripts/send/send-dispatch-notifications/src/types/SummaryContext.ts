import type { Dispatch } from '@go-automation/go-send';

/**
 * What the final summary shows (§12.4).
 */
export interface SummaryContext {
  readonly progress: Dispatch.DispatchProgress;
  /** Rows of the input (rows never journaled have no status in `progress`). */
  readonly totalRows: number;
  readonly failures: ReadonlyArray<Dispatch.FailureGroup>;
  readonly statistics: Dispatch.SendStatistics;
  /** Duration of the validation pass, ms. */
  readonly validationMs: number;
  /** Duration of send, verify and requestId phases, ms. */
  readonly executionMs: number;
  readonly output: Dispatch.DispatchSessionOutput;
  readonly runDir: string;
}
