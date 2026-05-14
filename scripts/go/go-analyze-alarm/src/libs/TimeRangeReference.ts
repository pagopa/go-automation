/**
 * Reference point used by {@link computeTimeRange} to compute the start
 * and end of the analysis window.
 *
 * - `single`: classic case — the alarm fired at a single timestamp, the
 *   window is symmetric (`at ± windowMinutes`).
 * - `multi`: the alarm spans multiple occurrences; the window is
 *   anchored to the first and last occurrence (`first - windowMinutes`
 *   to `last + windowMinutes`).
 */
export type TimeRangeReference =
  | { readonly kind: 'single'; readonly at: string }
  | { readonly kind: 'multi'; readonly first: string; readonly last: string };
