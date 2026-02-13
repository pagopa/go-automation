/**
 * Composable condition DSL for evaluating runbook context.
 * Conditions are used both in control flow steps and known case matching.
 */
export type Condition =
  | CompareCondition
  | PatternCondition
  | ExistsCondition
  | AndCondition
  | OrCondition
  | NotCondition;

/**
 * Comparison between a context value and an expected value.
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
 */
export interface PatternCondition {
  readonly type: 'pattern';
  readonly ref: string;
  readonly regex: string;
}

/**
 * Verifies that a value exists (not undefined, not null, not empty string).
 */
export interface ExistsCondition {
  readonly type: 'exists';
  readonly ref: string;
}

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
