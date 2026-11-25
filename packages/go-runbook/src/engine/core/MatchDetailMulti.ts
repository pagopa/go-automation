/**
 * Multi-match variant produced by {@link ContainsCondition} with a
 * `regex` field.
 *
 * `matchedCount` always reflects the **real** number of matches across
 * the array; `matchedElements` carries up to {@link MAX_TRACE_MATCHES}
 * sample hits so a regex that matches hundreds of rows does not bloat
 * the execution trace. `truncated` is `true` whenever
 * `matchedCount > matchedElements.length`.
 */
export interface MatchDetailMulti {
  readonly matched: boolean;
  readonly matchedCount: number;
  readonly matchedElements: ReadonlyArray<{ readonly index: number; readonly element: unknown }>;
  readonly totalElements: number;
  readonly truncated: boolean;
}
