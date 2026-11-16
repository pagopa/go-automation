import type { GORateLimiter } from '@pagopa/go-common/concurrency';

import type { DocumentResolver } from '../documents/DocumentResolver.js';
import type { RowLedger } from '../journal/RowLedger.js';
import type { DispatchClock } from '../model/DispatchClock.js';
import type { GlobalErrorHandler } from '../stages/GlobalErrorHandler.js';
import type { RateAdapter } from '../stages/RateAdapter.js';
import type { ExternalChannelsApi } from './ExternalChannelsApi.js';

/**
 * Options of {@link ./DirectSendStage.DirectSendStage}.
 */
export interface DirectSendStageOptions {
  readonly api: ExternalChannelsApi;
  /** pn-ec limiter (default 5/s, §9.2). */
  readonly limiter: GORateLimiter;
  /** Lowers the limiter rate on `429` and restores it after successes. */
  readonly rateAdapter: RateAdapter;
  readonly ledger: RowLedger;
  readonly clock: DispatchClock;
  /** Resolves the `ATTO` documents (pratica or reference). */
  readonly resolver: DocumentResolver;
  /** Attempts per session on 429/5xx/transport errors (default 3): the PUT is idempotent. */
  readonly maxAttempts?: number;
  readonly onGlobalError: GlobalErrorHandler;
  /** Aborted when the run stops: no new PUT starts; PUTs in flight are never aborted. */
  readonly signal: AbortSignal;
}
