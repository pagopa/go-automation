import type { InputReader } from '../input/InputReader.js';
import type { RowLedger } from '../journal/RowLedger.js';
import type { RecordFactory } from '../mapping/RecordFactory.js';
import type { RowSender } from '../stages/RowSender.js';
import type { VerifyStage } from '../stages/VerifyStage.js';
import type { RequestIdStage } from '../requestId/RequestIdStage.js';

/**
 * Options of {@link ./DispatchRun.DispatchRun}.
 */
export interface DispatchRunOptions {
  readonly reader: InputReader;
  readonly factory: RecordFactory;
  readonly ledger: RowLedger;
  /** Absent when `send` is not among the phases (RF-12). */
  readonly sendStage?: RowSender;
  /** Absent when `verify` is not among the phases. */
  readonly verifyStage?: VerifyStage;
  /** Absent when `request-id` is not among the phases. */
  readonly requestIdStage?: RequestIdStage;
  /** HTTP requests open at the same time (default 40). */
  readonly maxInFlight?: number;
  /** Resend `SEND_FAILED` rows marked retryable (resume, `--retry-failed`). */
  readonly retryFailed: boolean;
  /** Reconcile `SEND_UNCERTAIN` rows on resume (`--retry-uncertain`). */
  readonly retryUncertain: boolean;
  /** Stop at the first failed row. */
  readonly failFast: boolean;
  /** Aborted to stop the run (signal, global error, fail-fast). */
  readonly controller: AbortController;
}
