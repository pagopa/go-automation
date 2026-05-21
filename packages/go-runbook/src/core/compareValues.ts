import { valueToString } from '@go-automation/go-common/core';

import type { CompareOperator } from './CompareOperator.js';

/**
 * Compares two values with a runbook comparison operator.
 *
 * Both operands are stringified via `valueToString`. When **both** parse to
 * finite numbers the ordering operators (`>`, `<`, `>=`, `<=`) use numeric
 * comparison; otherwise they fall back to lexical string comparison.
 * Equality (`==`, `!=`) is always string-based so `'1'` and `1` compare equal.
 *
 * Single source of truth shared by {@link ConditionEvaluator} (known-case
 * `compare` conditions) and the `compare` check step — keeping the operator
 * semantics from drifting between the two.
 *
 * @param actual - The resolved left-hand value (any type).
 * @param operator - The comparison operator.
 * @param expected - The right-hand value.
 * @returns `true` when the comparison holds.
 */
export function compareValues(
  actual: unknown,
  operator: CompareOperator,
  expected: string | number | boolean,
): boolean {
  const actualStr = valueToString(actual);
  const expectedStr = valueToString(expected);

  const actualNum = Number(actualStr);
  const expectedNum = Number(expectedStr);
  const bothNumeric = !Number.isNaN(actualNum) && !Number.isNaN(expectedNum);

  switch (operator) {
    case '==':
      return actualStr === expectedStr;
    case '!=':
      return actualStr !== expectedStr;
    case '>':
      return bothNumeric ? actualNum > expectedNum : actualStr > expectedStr;
    case '<':
      return bothNumeric ? actualNum < expectedNum : actualStr < expectedStr;
    case '>=':
      return bothNumeric ? actualNum >= expectedNum : actualStr >= expectedStr;
    case '<=':
      return bothNumeric ? actualNum <= expectedNum : actualStr <= expectedStr;
    default: {
      const _exhaustive: never = operator;
      throw new Error(`Unknown operator: ${String(_exhaustive)}`);
    }
  }
}
