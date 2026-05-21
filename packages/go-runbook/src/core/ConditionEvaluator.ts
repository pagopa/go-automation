import { valueToString } from '@go-automation/go-common/core';
import type { Condition, ContainsCondition } from '../types/Condition.js';
import type { RunbookContext } from '../types/RunbookContext.js';
import { resolveRef } from '../steps/check/resolveRef.js';
import { compileRegex } from './compileRegex.js';
import { compareValues } from './compareValues.js';
import type { CompareOperator } from './CompareOperator.js';

// Condition types supported by the evaluator
type ConditionType = string | number | boolean;

interface PredicateEvaluation {
  readonly matched: boolean;
  readonly detail: unknown;
}

export interface ConditionEvaluationDetails {
  readonly matched: boolean;
  readonly resolvedValues: Readonly<Record<string, unknown>>;
}

interface ConditionEvaluationOptions {
  readonly withResolvedValues: true;
}

/**
 * Compact description of a match against an array element, surfaced via
 * detailed condition evaluation so the trace can show which element satisfied
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
 * regex) applies element-wise with OR (any-match). When detailed
 * evaluation is requested, the matched element is recorded so the trace
 * can surface it.
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
   * Evaluates a condition against the runbook context.
   *
   * @param condition - The condition to evaluate
   * @param context - The current runbook context
   * @returns Whether the condition is satisfied
   */
  evaluate(condition: Condition, context: RunbookContext): boolean;

  /**
   * Evaluates a condition and returns the resolved trace values in the
   * same traversal. This is used by known-case tracing: large array refs
   * are scanned once and represented with compact match-detail objects
   * instead of raw arrays.
   *
   * @param condition - The condition to evaluate
   * @param context - The current runbook context
   * @param options - Enables resolved-values collection for trace output
   * @returns Matched flag plus resolved values for case-evaluation trace
   */
  evaluate(
    condition: Condition,
    context: RunbookContext,
    options: ConditionEvaluationOptions,
  ): ConditionEvaluationDetails;

  evaluate(
    condition: Condition,
    context: RunbookContext,
    options?: ConditionEvaluationOptions,
  ): boolean | ConditionEvaluationDetails {
    const values: Record<string, unknown> = {};
    const matched = this.evaluateAndCollect(condition, context, values);
    if (options?.withResolvedValues === true) {
      return { matched, resolvedValues: values };
    }
    return matched;
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
    operator: CompareOperator,
    expected: ConditionType,
  ): PredicateEvaluation {
    if (actual === undefined || actual === null) {
      return { matched: false, detail: actual };
    }
    if (!Array.isArray(actual)) {
      return { matched: compareValues(actual, operator, expected), detail: actual };
    }
    const arr = actual as ReadonlyArray<unknown>;
    for (let i = 0; i < arr.length; i++) {
      const el = arr[i];
      if (el === undefined || el === null) continue;
      if (compareValues(el, operator, expected)) {
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

/**
 * Shared {@link ConditionEvaluator} instance.
 *
 * `ConditionEvaluator` is stateless — every method is pure — so a single
 * frozen instance can be reused everywhere instead of allocating one per
 * step or per `execute()` call.
 */
export const sharedConditionEvaluator: ConditionEvaluator = new ConditionEvaluator();
