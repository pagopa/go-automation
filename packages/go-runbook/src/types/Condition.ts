/**
 * Composable condition DSL for evaluating runbook context.
 * Conditions are used both in control flow steps and known case matching.
 */
export type Condition =
  CompareCondition | PatternCondition | ExistsCondition | ContainsCondition | AndCondition | OrCondition | NotCondition;

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

/**
 * Verifies that a value matches a regex pattern.
 *
 * **Array semantics**: when `ref` resolves to an array, the regex is
 * tested element-wise with **OR + short-circuit** — the condition is
 * satisfied at the first matching element. The matched element is
 * recorded in the case-evaluation trace.
 *
 * For "collect all matching rows" semantics use {@link ContainsCondition}
 * with a `regex` field instead.
 */
export interface PatternCondition {
  readonly type: 'pattern';
  readonly ref: string;
  readonly regex: string;
}

/**
 * Verifies that a value exists.
 *
 * - For scalars: non-undefined, non-null, non-empty string.
 * - For arrays: array `length > 0`.
 */
export interface ExistsCondition {
  readonly type: 'exists';
  readonly ref: string;
}

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

/**
 * Logical AND of multiple conditions.
 */
export interface AndCondition {
  readonly type: 'and';
  readonly conditions: ReadonlyArray<Condition>;
}

/**
 * Logical OR of multiple conditions.
 */
export interface OrCondition {
  readonly type: 'or';
  readonly conditions: ReadonlyArray<Condition>;
}

/**
 * Logical NOT of a condition.
 */
export interface NotCondition {
  readonly type: 'not';
  readonly condition: Condition;
}
