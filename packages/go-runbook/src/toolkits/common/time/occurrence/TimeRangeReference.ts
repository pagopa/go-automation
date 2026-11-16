/**
 * Reference point used by {@link computeTimeRange} to compute the start
 * and end of the analysis window.
 *
 * - `single`: classic case — the alarm fired at a single timestamp; the
 *   configured before/after padding is applied around `at`.
 * - `multi`: the alarm spans multiple occurrences; the window is
 *   anchored to the first and last occurrence (`first - beforeMinutes`
 *   to `last + afterMinutes`).
 */
export type TimeRangeReference =
  | { readonly kind: 'single'; readonly at: string }
  | { readonly kind: 'multi'; readonly first: string; readonly last: string };
