import type { CompareCondition } from './CompareCondition.js';
import type { ContainsCondition } from './ContainsCondition.js';
import type { ExistsCondition } from './ExistsCondition.js';
import type { PatternCondition } from './PatternCondition.js';

/**
 * Composable condition DSL for evaluating runbook context.
 * Conditions are used both in control flow steps and known error matching.
 */
export type Condition =
  CompareCondition | PatternCondition | ExistsCondition | ContainsCondition | AndCondition | OrCondition | NotCondition;

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
