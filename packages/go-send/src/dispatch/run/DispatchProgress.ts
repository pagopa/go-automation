import type { RowStatus } from '../model/RowStatus.js';

/**
 * Snapshot of a running session, for the progress line (§15).
 */
export interface DispatchProgress {
  readonly byStatus: ReadonlyMap<RowStatus, number>;
  /** Current B2B rate (lower than configured after 429s). */
  readonly ratePerSecond: number;
  readonly throttled: number;
  readonly verifyPending: number;
  readonly queuedCalls: number;
}
