/**
 * Fleet-wide summary of a sweep, and the exit-code decision.
 *
 * The five counters partition the configured profiles: every profile lands in
 * exactly one of them, so they always add up to `profileCount`.
 */
export interface ScheduleSweepVerdict {
  /** Number of profiles swept */
  readonly profileCount: number;

  /** Profiles moved to the target state by this run */
  readonly changed: number;

  /** Profiles already in the target state, before or by the time of the write */
  readonly unchanged: number;

  /** Profiles that needed a change and did not get one (dry run, or no write phase) */
  readonly pending: number;

  /** Profiles that do not have the schedule at all */
  readonly missing: number;

  /** Profiles whose read or write failed */
  readonly failed: number;

  /**
   * Whether the fleet is in the requested shape.
   *
   * `pending` deliberately does not break convergence: a `--dry-run` reports
   * outstanding work without failing, which is a separate feature.
   */
  readonly converged: boolean;
}
