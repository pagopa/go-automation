/**
 * Throughput, retry and timing knobs of a session (§13).
 */
export interface DispatchSessionTuning {
  /** B2B calls per second (default 20). */
  readonly rate: number;
  readonly burst: number;
  readonly rateAdaptive: boolean;
  readonly maxInFlight: number;
  readonly sendTimeoutMs: number;
  readonly retryAmbiguous: boolean;
  readonly retryFailed: boolean;
  readonly retryUncertain: boolean;
  readonly failFast: boolean;
  readonly verifyInitialDelayMs: number;
  readonly verifyTimeoutMs: number;
  readonly preloadBatchSize: number;
  readonly uploadConcurrency: number;
  readonly uploadReuseMaxAgeMs: number;
}
