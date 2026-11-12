/**
 * Result of a `GORetryRunner.run()` invocation enriched with metadata.
 *
 * The primary `run()` API returns the raw value `T` for ergonomics; callers
 * that need attempt counts and elapsed time can use `runWithMetadata()`
 * (when added) or wrap the call site to capture timing.
 */
export interface GORetryResult<T> {
  /** Value returned by the successful attempt. */
  readonly value: T;
  /** Number of attempts performed (1 if first try succeeded). */
  readonly attempts: number;
  /** Total elapsed time in milliseconds. */
  readonly elapsedMs: number;
}
