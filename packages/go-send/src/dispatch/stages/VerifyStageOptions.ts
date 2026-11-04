import type { GORateLimiter } from '@go-automation/go-common/core';

import type { SENDApiVersion } from '../../services/notification/models/SENDApiVersion.js';
import type { B2BApi } from '../channels/B2BApi.js';
import type { RowLedger } from '../journal/RowLedger.js';
import type { DispatchClock } from '../model/DispatchClock.js';
import type { AcceptedHandler } from './AcceptedHandler.js';
import type { GlobalErrorHandler } from './GlobalErrorHandler.js';

/**
 * Options of {@link ./VerifyStage.VerifyStage}.
 */
export interface VerifyStageOptions {
  readonly api: B2BApi;
  /** Shared B2B limiter: checks use priority 1, after the sends. */
  readonly limiter: GORateLimiter;
  readonly ledger: RowLedger;
  readonly clock: DispatchClock;
  readonly apiVersion: SENDApiVersion;
  /** First check after the send, ms (default 10 s). */
  readonly initialDelayMs?: number;
  /** Timeout per row, from its first granted check, ms (default 15 min). */
  readonly timeoutMs?: number;
  /** Maximum delay between checks, ms (default 60 s). */
  readonly maxDelayMs?: number;
  readonly onGlobalError: GlobalErrorHandler;
  /** Called on `ACCEPTED` (e.g. to start the requestId retrieval). */
  readonly onAccepted?: AcceptedHandler;
  /** Aborted when the run stops: pending checks and checks in flight are dropped (resume continues them). */
  readonly signal: AbortSignal;
}
