import type { GORateLimiter } from '@go-automation/go-common/core';

import type { DocumentResolver } from '../documents/DocumentResolver.js';
import type { RowLedger } from '../journal/RowLedger.js';
import type { DispatchClock } from '../model/DispatchClock.js';
import type { GlobalErrorHandler } from '../stages/GlobalErrorHandler.js';
import type { ExternalChannelsApi } from './ExternalChannelsApi.js';

/**
 * Options of {@link ./DirectSendStage.DirectSendStage}.
 */
export interface DirectSendStageOptions {
  readonly api: ExternalChannelsApi;
  /** pn-ec limiter (default 5/s, §9.2). */
  readonly limiter: GORateLimiter;
  readonly ledger: RowLedger;
  readonly clock: DispatchClock;
  /** Resolves the `ATTO` documents (pratica or reference). */
  readonly resolver: DocumentResolver;
  /** Attempts on 429/5xx/transport errors (default 3): the PUT is idempotent. */
  readonly maxAttempts?: number;
  readonly onGlobalError: GlobalErrorHandler;
  readonly signal: AbortSignal;
}
