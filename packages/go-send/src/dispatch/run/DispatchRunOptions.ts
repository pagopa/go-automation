import type { InputReader } from '../input/InputReader.js';
import type { RowLedger } from '../journal/RowLedger.js';
import type { RecordFactory } from '../mapping/RecordFactory.js';
import type { RowSender } from '../stages/RowSender.js';
import type { VerifyStage } from '../stages/VerifyStage.js';
import type { RequestIdStage } from '../requestId/RequestIdStage.js';
import type { RowActionPolicy } from './RowActionPolicy.js';

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
  /**
   * What happens to each row on (re)start: the same policy the validation
   * pass used. `verify` / `requestId` must match the stages given above.
   */
  readonly policy: RowActionPolicy;
  /** Stop at the first failed row. */
  readonly failFast: boolean;
  /** Aborted to stop the run (signal, global error, fail-fast, failure). */
  readonly controller: AbortController;
}
