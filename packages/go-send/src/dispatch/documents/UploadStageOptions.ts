import type { GORateLimiter } from '@go-automation/go-common/core';

import type { RecordedUpload } from '../journal/RecordedUpload.js';
import type { RowLedger } from '../journal/RowLedger.js';
import type { DispatchClock } from '../model/DispatchClock.js';
import type { SafeStorageGateway } from './SafeStorageGateway.js';

/**
 * Options of {@link ./UploadStage.UploadStage}.
 */
export interface UploadStageOptions {
  readonly gateway: SafeStorageGateway;
  /** B2B limiter: preloads use priority 0, like sends. */
  readonly limiter: GORateLimiter;
  readonly ledger: RowLedger;
  readonly clock: DispatchClock;
  /** Files per preload call, 1–15 (default 15). */
  readonly batchSize?: number;
  /** Longest wait to fill a batch, ms (default 200). */
  readonly batchWaitMs?: number;
  /** Parallel PUTs (default 5). */
  readonly uploadConcurrency?: number;
  /** A PUT not started this long after its preload gets a new preload (default 15 min). */
  readonly presignedMaxAgeMs?: number;
  /** Uploads of a previous session, reusable when recent (resume). */
  readonly previousUploads?: ReadonlyArray<RecordedUpload>;
  /** Maximum age of a reusable previous upload, ms (default 72 h). */
  readonly reuseMaxAgeMs?: number;
  /** Aborted when the run stops: preloads, PUTs and retry waits are abandoned. */
  readonly signal?: AbortSignal;
}
