/**
 * Compact description of a match against an array element, surfaced via
 * detailed condition evaluation so the trace can show which element satisfied
 * the predicate (without dumping the entire raw collection).
 */
export interface MatchDetailSingle {
  readonly matched: true;
  readonly matchedIndex: number;
  readonly matchedElement: unknown;
  readonly totalElements: number;
}
