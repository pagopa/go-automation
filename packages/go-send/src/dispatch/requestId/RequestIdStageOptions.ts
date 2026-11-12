import type { RowLedger } from '../journal/RowLedger.js';
import type { DispatchClock } from '../model/DispatchClock.js';
import type { CredentialErrorPredicate } from './CredentialErrorPredicate.js';
import type { RequestIdSelectionOptions } from './RequestIdSelectionOptions.js';
import type { TimelineSource } from './TimelineSource.js';

/**
 * Options of {@link ./RequestIdStage.RequestIdStage}.
 */
export interface RequestIdStageOptions {
  readonly source: TimelineSource;
  readonly ledger: RowLedger;
  readonly clock: DispatchClock;
  readonly selection: RequestIdSelectionOptions;
  /** First check after acceptance (or send), ms (default 60 s). */
  readonly initialDelayMs?: number;
  /** Maximum delay between checks, ms (default 120 s). */
  readonly maxDelayMs?: number;
  /** Timeout per row, ms (default 2 h). */
  readonly timeoutMs?: number;
  /** Timeline queries in parallel (default 10). */
  readonly concurrency?: number;
  /** Recognizes expired or rejected AWS credentials (provided by the caller). */
  readonly isCredentialError: CredentialErrorPredicate;
  /** Aborted when the run stops: pending checks are dropped (resume continues them). */
  readonly signal: AbortSignal;
}
