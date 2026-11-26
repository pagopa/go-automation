/**
 * Comparison between a context value and an expected scalar.
 *
 * **Array semantics**: when `ref` resolves to an array, the predicate
 * applies element-wise with OR (any-match) — the condition is satisfied
 * if at least one element of the array passes the comparison. The
 * matched element is recorded in the case-evaluation trace.
 *
 * @example
 * ```typescript
 * const condition: CompareCondition = {
 *   type: 'compare',
 *   ref: 'vars.statusCode',
 *   operator: '==',
 *   value: '504',
 * };
 * ```
 */
export interface CompareCondition {
  readonly type: 'compare';
  /** Reference to a value in context: 'vars.errorCode', 'steps.step1.output', etc. */
  readonly ref: string;
  readonly operator: '==' | '!=' | '>' | '<' | '>=' | '<=';
  readonly value: string | number | boolean;
}
