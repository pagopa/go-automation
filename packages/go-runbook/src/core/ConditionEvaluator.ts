import { valueToString } from '@go-automation/go-common/core';
import type { Condition, ContainsCondition } from '../types/Condition.js';
import type { RunbookContext } from '../types/RunbookContext.js';
import { resolveRef } from '../steps/check/resolveRef.js';
import { compileRegex } from './compileRegex.js';

// Condition operators for compare conditions
type ConditionOperator = '==' | '!=' | '>' | '<' | '>=' | '<=';

// Condition types supported by the evaluator
type ConditionType = string | number | boolean;

interface PredicateEvaluation {
  readonly matched: boolean;
  readonly detail: unknown;
}

/**
 * Compact description of a match against an array element, surfaced via
 * `collectResolvedValues` so the trace can show which element satisfied
 * the predicate (without dumping the entire raw collection).
 */
interface MatchDetailSingle {
  readonly matched: true;
  readonly matchedIndex: number;
  readonly matchedElement: unknown;
  readonly totalElements: number;
}

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
interface MatchDetailMulti {
  readonly matched: boolean;
  readonly matchedCount: number;
  readonly matchedElements: ReadonlyArray<{ readonly index: number; readonly element: unknown }>;
  readonly totalElements: number;
  readonly truncated: boolean;
}

/**
 * Maximum number of `matchedElements` entries persisted in the trace
 * for a {@link ContainsCondition} regex variant. Picked generously
 * enough to surface a few representative hits while keeping the
 * `caseEvaluations[].resolvedValues` payload small even when a regex
 * matches every row of a multi-thousand-row CloudWatch result.
 */
const MAX_TRACE_MATCHES = 10;

/**
 * Evaluates conditions against the runbook context.
 * Supports reference resolution for vars, step outputs, and params.
 *
 * Reference format:
 * - `'vars.{name}'`           -> variable from context
 * - `'steps.{stepId}.output'` -> output of a previous step
 * - `'params.{name}'`         -> runbook input parameter
 *
 * **Array semantics**: when a `ref` resolves to an array, every
 * predicate operator (`compare`, `pattern`, `contains` with value or
 * regex) applies element-wise with OR (any-match). The matched element
 * is recorded in `collectResolvedValues` so the trace can surface it.
 *
 * @example
 * ```typescript
 * const evaluator = new ConditionEvaluator();
 * const matched = evaluator.evaluate(
 *   { type: 'compare', ref: 'vars.statusCode', operator: '==', value: '504' },
 *   context,
 * );
 * ```
 */
export class ConditionEvaluator {
  /**
   * Collects all resolved reference values from a condition.
   * Used to populate resolvedValues in CaseEvaluationTrace.
   *
   * When the predicate is array-aware and the ref resolves to an array,
   * the returned record contains a compact match-detail object instead
   * of the raw array (which would be huge for a typical CloudWatch
   * query result).
   *
   * @param condition - The condition to inspect
   * @param context - The current runbook context
   * @returns Record mapping reference strings to their resolved values
   */
  collectResolvedValues(condition: Condition, context: RunbookContext): Readonly<Record<string, unknown>> {
    return this.evaluateWithResolvedValues(condition, context).resolvedValues;
  }

  /**
   * Evaluates a condition and collects the resolved trace values in the
   * same traversal. This is the preferred path for known-case matching:
   * large array refs (for example CloudWatch query rows) are scanned at
   * most once per leaf condition instead of once for the boolean result
   * and again for trace detail generation.
   *
   * @param condition - The condition to evaluate
   * @param context - The current runbook context
   * @returns Matched flag plus resolved values for case-evaluation trace
   */
  evaluateWithResolvedValues(
    condition: Condition,
    context: RunbookContext,
  ): { readonly matched: boolean; readonly resolvedValues: Readonly<Record<string, unknown>> } {
    const values: Record<string, unknown> = {};
    const matched = this.evaluateAndCollect(condition, context, values);
    return { matched, resolvedValues: values };
  }

  /**
   * Evaluates a condition against the runbook context.
   *
   * @param condition - The condition to evaluate
   * @param context - The current runbook context
   * @returns Whether the condition is satisfied
   */
  evaluate(condition: Condition, context: RunbookContext): boolean {
    switch (condition.type) {
      case 'compare':
        return this.evaluateCompare(condition.ref, condition.operator, condition.value, context);
      case 'pattern':
        return this.evaluatePattern(condition.ref, condition.regex, context);
      case 'exists':
        return this.evaluateExists(condition.ref, context);
      case 'contains':
        return this.evaluateContains(condition, context);
      case 'and':
        return condition.conditions.every((c) => this.evaluate(c, context));
      case 'or':
        return condition.conditions.some((c) => this.evaluate(c, context));
      case 'not':
        return !this.evaluate(condition.condition, context);
      default: {
        const _exhaustive: never = condition;
        throw new Error(`Unknown condition type: ${(_exhaustive as Condition).type}`);
      }
    }
  }

  /**
   * Evaluates a compare condition. When the ref resolves to an array,
   * applies the operator element-wise with OR (any-match).
   */
  private evaluateCompare(
    ref: string,
    operator: ConditionOperator,
    expected: ConditionType,
    context: RunbookContext,
  ): boolean {
    const actual = resolveRef(ref, context);
    if (actual === undefined || actual === null) {
      return false;
    }

    if (Array.isArray(actual)) {
      for (const el of actual) {
        if (el === undefined || el === null) continue;
        if (this.compareScalar(el, operator, expected)) return true;
      }
      return false;
    }

    return this.compareScalar(actual, operator, expected);
  }

  /**
   * Performs the scalar comparison used by both the scalar and the
   * array-element branches of {@link evaluateCompare}.
   */
  private compareScalar(actual: unknown, operator: ConditionOperator, expected: ConditionType): boolean {
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

  /**
   * Evaluates a pattern condition. When the ref resolves to an array,
   * the regex is tested element-wise with OR + short-circuit: the
   * condition is satisfied at the first matching element.
   */
  private evaluatePattern(ref: string, regex: string, context: RunbookContext): boolean {
    const actual = resolveRef(ref, context);
    if (actual === undefined || actual === null) {
      return false;
    }
    const compiled = compileRegex(regex);

    if (Array.isArray(actual)) {
      for (const el of actual) {
        if (el === undefined || el === null) continue;
        if (compiled.test(valueToString(el))) return true;
      }
      return false;
    }

    return compiled.test(valueToString(actual));
  }

  /**
   * Evaluates an exists condition.
   * - scalars: `actual` is not undefined/null and its string form is not empty
   * - arrays:  `actual.length > 0`
   */
  private evaluateExists(ref: string, context: RunbookContext): boolean {
    const actual = resolveRef(ref, context);
    if (actual === undefined || actual === null) return false;
    if (Array.isArray(actual)) return actual.length > 0;
    return valueToString(actual) !== '';
  }

  /**
   * Evaluates a contains condition.
   *
   * - **value variant** (SQL `IN`):
   *   - scalar ref: `ref ∈ value`
   *   - array ref:  intersection between `ref` and `value` is non-empty
   * - **regex variant**:
   *   - scalar ref: `regex.test(ref)`
   *   - array ref:  returns `true` when at least one element matches.
   *     Use {@link evaluateWithResolvedValues} when the caller also
   *     needs the trace payload with every matching element.
   */
  private evaluateContains(condition: ContainsCondition, context: RunbookContext): boolean {
    const actual = resolveRef(condition.ref, context);
    if (actual === undefined || actual === null) return false;

    if (condition.regex !== undefined) {
      const compiled = compileRegex(condition.regex);
      if (Array.isArray(actual)) {
        for (const el of actual) {
          if (el === undefined || el === null) continue;
          if (compiled.test(valueToString(el))) {
            return true;
          }
        }
        return false;
      }
      return compiled.test(valueToString(actual));
    }

    if (condition.value === undefined) {
      return false;
    }
    const candidates = new Set(condition.value.map((v) => valueToString(v)));
    if (Array.isArray(actual)) {
      for (const el of actual) {
        if (el === undefined || el === null) continue;
        if (candidates.has(valueToString(el))) return true;
      }
      return false;
    }
    return candidates.has(valueToString(actual));
  }

  private evaluateAndCollect(condition: Condition, context: RunbookContext, values: Record<string, unknown>): boolean {
    switch (condition.type) {
      case 'compare': {
        const actual = resolveRef(condition.ref, context);
        const result = this.evaluateCompareWithDetail(actual, condition.operator, condition.value);
        values[condition.ref] = result.detail;
        return result.matched;
      }
      case 'pattern': {
        const actual = resolveRef(condition.ref, context);
        const result = this.evaluatePatternWithDetail(actual, condition.regex);
        values[condition.ref] = result.detail;
        return result.matched;
      }
      case 'exists': {
        const actual = resolveRef(condition.ref, context);
        const result = this.evaluateExistsWithDetail(actual);
        values[condition.ref] = result.detail;
        return result.matched;
      }
      case 'contains': {
        const actual = resolveRef(condition.ref, context);
        const result = this.evaluateContainsWithDetail(actual, condition);
        values[condition.ref] = result.detail;
        return result.matched;
      }
      case 'and': {
        let matched = true;
        for (const c of condition.conditions) {
          if (!this.evaluateAndCollect(c, context, values)) {
            matched = false;
          }
        }
        return matched;
      }
      case 'or': {
        let matched = false;
        for (const c of condition.conditions) {
          if (this.evaluateAndCollect(c, context, values)) {
            matched = true;
          }
        }
        return matched;
      }
      case 'not':
        return !this.evaluateAndCollect(condition.condition, context, values);
      default: {
        const _exhaustive: never = condition;
        throw new Error(`Unknown condition type: ${(_exhaustive as Condition).type}`);
      }
    }
  }

  private evaluateExistsWithDetail(actual: unknown): PredicateEvaluation {
    if (!Array.isArray(actual)) {
      return {
        matched: actual !== undefined && actual !== null && valueToString(actual) !== '',
        detail: actual,
      };
    }
    const arr = actual as ReadonlyArray<unknown>;
    return {
      matched: arr.length > 0,
      detail: { matched: arr.length > 0, totalElements: arr.length },
    };
  }

  /**
   * Compact trace detail for a `compare` condition. For scalar refs
   * returns the resolved value as-is. For array refs returns the first
   * element that satisfies the comparison (or `{ matched: false }`).
   */
  private evaluateCompareWithDetail(
    actual: unknown,
    operator: ConditionOperator,
    expected: ConditionType,
  ): PredicateEvaluation {
    if (actual === undefined || actual === null) {
      return { matched: false, detail: actual };
    }
    if (!Array.isArray(actual)) {
      return { matched: this.compareScalar(actual, operator, expected), detail: actual };
    }
    const arr = actual as ReadonlyArray<unknown>;
    for (let i = 0; i < arr.length; i++) {
      const el = arr[i];
      if (el === undefined || el === null) continue;
      if (this.compareScalar(el, operator, expected)) {
        const detail: MatchDetailSingle = {
          matched: true,
          matchedIndex: i,
          matchedElement: el,
          totalElements: arr.length,
        };
        return { matched: true, detail };
      }
    }
    return { matched: false, detail: { matched: false, matchedCount: 0, totalElements: arr.length } };
  }

  /**
   * Compact trace detail for a `pattern` condition. For arrays records
   * the first matching element (consistent with the OR + short-circuit
   * semantic of {@link evaluatePattern}).
   */
  private evaluatePatternWithDetail(actual: unknown, regex: string): PredicateEvaluation {
    if (actual === undefined || actual === null) {
      return { matched: false, detail: actual };
    }
    const compiled = compileRegex(regex);
    if (!Array.isArray(actual)) {
      return { matched: compiled.test(valueToString(actual)), detail: actual };
    }
    const arr = actual as ReadonlyArray<unknown>;
    for (let i = 0; i < arr.length; i++) {
      const el = arr[i];
      if (el === undefined || el === null) continue;
      if (compiled.test(valueToString(el))) {
        const detail: MatchDetailSingle = {
          matched: true,
          matchedIndex: i,
          matchedElement: el,
          totalElements: arr.length,
        };
        return { matched: true, detail };
      }
    }
    return { matched: false, detail: { matched: false, matchedCount: 0, totalElements: arr.length } };
  }

  /**
   * Compact trace detail for a `contains` condition.
   * - value variant on array: first element belonging to `value`.
   * - regex variant on array: count of matching elements + up to
   *   {@link MAX_TRACE_MATCHES} sample hits (the rest are dropped from
   *   the trace and a `truncated` flag is raised).
   */
  private evaluateContainsWithDetail(actual: unknown, condition: ContainsCondition): PredicateEvaluation {
    if (actual === undefined || actual === null) {
      return { matched: false, detail: actual };
    }
    if (condition.regex !== undefined) {
      const compiled = compileRegex(condition.regex);
      if (!Array.isArray(actual)) {
        return { matched: compiled.test(valueToString(actual)), detail: actual };
      }
      const arr = actual as ReadonlyArray<unknown>;
      let matchedCount = 0;
      const samples: { index: number; element: unknown }[] = [];
      for (let i = 0; i < arr.length; i++) {
        const el = arr[i];
        if (el === undefined || el === null) continue;
        if (compiled.test(valueToString(el))) {
          matchedCount += 1;
          if (samples.length < MAX_TRACE_MATCHES) {
            samples.push({ index: i, element: el });
          }
        }
      }
      const detail: MatchDetailMulti = {
        matched: matchedCount > 0,
        matchedCount,
        matchedElements: samples,
        totalElements: arr.length,
        truncated: matchedCount > samples.length,
      };
      return { matched: detail.matched, detail };
    }

    if (condition.value === undefined) {
      if (Array.isArray(actual)) {
        return {
          matched: false,
          detail: { matched: false, matchedCount: 0, totalElements: actual.length },
        };
      }
      return { matched: false, detail: actual };
    }
    const candidates = new Set(condition.value.map((v) => valueToString(v)));
    if (!Array.isArray(actual)) {
      return { matched: candidates.has(valueToString(actual)), detail: actual };
    }
    const arr = actual as ReadonlyArray<unknown>;
    for (let i = 0; i < arr.length; i++) {
      const el = arr[i];
      if (el === undefined || el === null) continue;
      if (candidates.has(valueToString(el))) {
        const detail: MatchDetailSingle = {
          matched: true,
          matchedIndex: i,
          matchedElement: el,
          totalElements: arr.length,
        };
        return { matched: true, detail };
      }
    }
    return { matched: false, detail: { matched: false, matchedCount: 0, totalElements: arr.length } };
  }
}
