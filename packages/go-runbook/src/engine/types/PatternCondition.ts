/**
 * Verifies that a value matches a regex pattern.
 *
 * **Array semantics**: when `ref` resolves to an array, the regex is
 * tested element-wise with OR — the condition is satisfied when at least
 * one element matches. A plain verdict stops at the first match; the
 * detailed evaluation of a known case visits every element, so the
 * evidence keeps every matching row while the trace shows the first.
 *
 * For a trace that lists every matching row use {@link ContainsCondition}
 * with a `regex` field instead.
 */
export interface PatternCondition {
  readonly type: 'pattern';
  readonly ref: string;
  readonly regex: string;
}
