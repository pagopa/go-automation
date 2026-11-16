/**
 * Context passed by the runner to a {@link GOBackoffFn} on each delay decision.
 *
 * Carries per-run state so that backoff strategies remain pure factories
 * (no closure-captured mutable state shared across concurrent runs).
 */
export interface GOBackoffContext {
  /** Zero-based attempt number. */
  readonly attempt: number;
  /**
   * Delay (ms) chosen at the previous attempt for the same run.
   * Undefined on the first attempt of a run.
   *
   * Used by stateful strategies (e.g. decorrelated jitter) without
   * requiring the factory to keep mutable state.
   */
  readonly previousDelayMs?: number;
}
