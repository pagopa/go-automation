import type { GORateLimiter } from '@go-automation/go-common/core';

import type { SENDApiVersion } from '../../services/notification/models/SENDApiVersion.js';
import type { B2BApi } from '../channels/B2BApi.js';
import type { DocumentResolver } from '../documents/DocumentResolver.js';
import type { RowLedger } from '../journal/RowLedger.js';
import type { DispatchClock } from '../model/DispatchClock.js';
import type { GlobalErrorHandler } from './GlobalErrorHandler.js';
import type { RateAdapter } from './RateAdapter.js';
import type { SentHandler } from './SentHandler.js';

/**
 * Options of {@link ./SendStage.SendStage}.
 */
export interface SendStageOptions {
  readonly api: B2BApi;
  readonly limiter: GORateLimiter;
  readonly rateAdapter: RateAdapter;
  readonly ledger: RowLedger;
  readonly clock: DispatchClock;
  readonly resolver: DocumentResolver;
  readonly runId: string;
  readonly apiVersion: SENDApiVersion;
  /** Reconcile ambiguous outcomes with the protocol lookup (default `true`). */
  readonly retryAmbiguous: boolean;
  /** Longest time a row may keep being rescheduled because of `429`, ms. */
  readonly sendTimeoutMs: number;
  /** Wait before the lookup of an ambiguous send, ms (default 5 s). */
  readonly reconcileDelayMs?: number;
  /** New POSTs after a `404` lookup, at most (default 3). */
  readonly maxReconcilePosts?: number;
  /** Failed lookups (5xx, transport) tolerated before `SEND_UNCERTAIN` (default 3). */
  readonly maxLookupFailures?: number;
  readonly onSent: SentHandler;
  readonly onGlobalError: GlobalErrorHandler;
  /** Aborted when the run stops: no new POST starts. */
  readonly signal: AbortSignal;
}
