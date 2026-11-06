import type { RowAcceptance } from '../model/RowAcceptance.js';
import type { RowStatus } from '../model/RowStatus.js';

/**
 * Snapshot of a running session, for the progress line (§15).
 */
export interface DispatchProgress {
  readonly byStatus: ReadonlyMap<RowStatus, number>;
  /**
   * Rows by SEND acceptance, from explicit evidence (`acceptanceOf`): a
   * status alone does not say it (`REQUEST_ID_NOT_FOUND` may follow a
   * `REQUEST_REFUSED` timeline).
   */
  readonly byAcceptance: ReadonlyMap<RowAcceptance, number>;
  /** Current B2B rate (lower than configured after 429s). */
  readonly ratePerSecond: number;
  readonly throttled: number;
  readonly verifyPending: number;
  readonly requestIdPending: number;
  readonly queuedCalls: number;
}
