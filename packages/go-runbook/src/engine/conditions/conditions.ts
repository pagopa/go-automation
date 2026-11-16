import type { Condition } from '../types/Condition.js';

/** Logical AND over the supplied runbook conditions. */
export function all(...conditions: ReadonlyArray<Condition>): Condition {
  return { type: 'and', conditions };
}

/** Logical OR over the supplied runbook conditions. */
export function any(...conditions: ReadonlyArray<Condition>): Condition {
  return { type: 'or', conditions };
}

/** Logical negation of one runbook condition. */
export function not(condition: Condition): Condition {
  return { type: 'not', condition };
}
