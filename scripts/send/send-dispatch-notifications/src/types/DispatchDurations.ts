/**
 * Duration parameters of the script, parsed and range-checked (milliseconds).
 */
export interface DispatchDurations {
  readonly httpTimeoutMs: number;
  readonly sendTimeoutMs: number;
  readonly verifyInitialDelayMs: number;
  readonly verifyTimeoutMs: number;
  readonly requestIdInitialDelayMs: number;
  readonly requestIdTimeoutMs: number;
  /** An age, not a timer: may exceed the `setTimeout` maximum. */
  readonly uploadReuseMaxAgeMs: number;
}
