/**
 * SQL `IN`-style membership / regex enumeration over a collection.
 *
 * Two mutually-exclusive variants:
 *
 * - **value variant** (`value: ReadonlyArray<scalar>`): `LHS ∈ value`.
 *   When `ref` resolves to an array, the condition is satisfied iff the
 *   intersection between `ref` and `value` is non-empty.
 * - **regex variant** (`regex: string`): when `ref` is an array,
 *   records every matching row in the trace when resolved values are
 *   requested. Returns `true` when at least one row matches.
 *
 * Differs from {@link PatternCondition} (regex variant) by:
 * - no short-circuit on first match;
 * - the case-evaluation trace receives the **full list** of matching
 *   rows instead of just the first one.
 *
 * @example
 * ```typescript
 * // SQL IN: any of the listed values
 * { type: 'contains', ref: 'vars.apiGwStatusCode', value: ['500', '502', '504'] }
 *
 * // Find every row matching a regex
 * { type: 'contains', ref: 'steps.query-pn-external-registries',
 *   regex: '\\[DOWNSTREAM\\] Service IO returned errors=500' }
 * ```
 */
export type ContainsCondition =
  | {
      readonly type: 'contains';
      readonly ref: string;
      readonly value: ReadonlyArray<string | number | boolean>;
      readonly regex?: never;
    }
  | {
      readonly type: 'contains';
      readonly ref: string;
      readonly regex: string;
      readonly value?: never;
    };
