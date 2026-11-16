/**
 * Accepted range of {@link ./GODurationParse.parseDuration}, in milliseconds,
 * applied after rounding to whole milliseconds.
 */
export interface GODurationParseOptions {
  /** Smallest accepted duration, inclusive (default `0`). Pass `1` to reject zero durations. */
  readonly minMs?: number;

  /**
   * Largest accepted duration, inclusive (default `2_147_483_647`, the
   * `setTimeout` maximum: Node fires a longer timer after 1 ms instead).
   */
  readonly maxMs?: number;
}
