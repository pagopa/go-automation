import { valueToString } from '@go-automation/go-common/core';
import type { Condition, ContainsCondition } from '../types/Condition.js';
import type { RunbookContext } from '../types/RunbookContext.js';
import { compileRegex } from './compileRegex.js';

// Condition operators for compare conditions
type ConditionOperator = '==' | '!=' | '>' | '<' | '>=' | '<=';

// Condition types supported by the evaluator
type ConditionType = string | number | boolean;

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
    const values: Record<string, unknown> = {};
    this.collectRefs(condition, context, values);
    return values;
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
    const actual = this.resolveRef(ref, context);
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
    const actual = this.resolveRef(ref, context);
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
    const actual = this.resolveRef(ref, context);
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
   *   - array ref:  scans every element (no short-circuit); returns
   *     `true` when at least one matches (the trace receives the full
   *     list of matched elements via {@link collectRefs}).
   */
  private evaluateContains(condition: ContainsCondition, context: RunbookContext): boolean {
    const actual = this.resolveRef(condition.ref, context);
    if (actual === undefined || actual === null) return false;

    if (condition.regex !== undefined) {
      const compiled = compileRegex(condition.regex);
      if (Array.isArray(actual)) {
        let matched = false;
        for (const el of actual) {
          if (el === undefined || el === null) continue;
          if (compiled.test(valueToString(el))) {
            matched = true;
            // No break: contains-regex is the "find all" variant.
            // Boolean result is settled, but we still scan so the trace
            // (via collectRefs) sees the full list — that work happens
            // there, not here. We could break early for performance, but
            // the per-element cost is negligible on typical sizes.
          }
        }
        return matched;
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

  /**
   * Recursively collects all reference values from a condition tree.
   *
   * For array refs, stores a compact match-detail object rather than
   * the raw array. The detail shape depends on the condition:
   * - `compare`, `pattern`, `contains` (value variant): single match
   *   (`MatchDetailSingle`) — first satisfying element
   * - `contains` (regex variant): multi-match (`MatchDetailMulti`)
   *   with every matching element and their count
   */
  private collectRefs(condition: Condition, context: RunbookContext, values: Record<string, unknown>): void {
    switch (condition.type) {
      case 'compare': {
        const actual = this.resolveRef(condition.ref, context);
        values[condition.ref] = this.detailForCompare(actual, condition.operator, condition.value);
        break;
      }
      case 'pattern': {
        const actual = this.resolveRef(condition.ref, context);
        values[condition.ref] = this.detailForPattern(actual, condition.regex);
        break;
      }
      case 'exists': {
        const actual = this.resolveRef(condition.ref, context);
        values[condition.ref] = this.detailForExists(actual);
        break;
      }
      case 'contains': {
        const actual = this.resolveRef(condition.ref, context);
        values[condition.ref] = this.detailForContains(actual, condition);
        break;
      }
      case 'and':
        for (const c of condition.conditions) {
          this.collectRefs(c, context, values);
        }
        break;
      case 'or':
        for (const c of condition.conditions) {
          this.collectRefs(c, context, values);
        }
        break;
      case 'not':
        this.collectRefs(condition.condition, context, values);
        break;
      default: {
        const _exhaustive: never = condition;
        throw new Error(`Unknown condition type: ${(_exhaustive as Condition).type}`);
      }
    }
  }

  /**
   * Compact trace detail for an `exists` condition. For scalar refs
   * returns the resolved value as-is. For array refs returns a small
   * `{ matched, totalElements }` envelope so a presence check on a
   * step output (e.g. a CloudWatch query result with thousands of
   * rows) does not bloat the execution trace.
   */
  private detailForExists(actual: unknown): unknown {
    if (!Array.isArray(actual)) return actual;
    const arr = actual as ReadonlyArray<unknown>;
    return { matched: arr.length > 0, totalElements: arr.length };
  }

  /**
   * Compact trace detail for a `compare` condition. For scalar refs
   * returns the resolved value as-is. For array refs returns the first
   * element that satisfies the comparison (or `{ matched: false }`).
   */
  private detailForCompare(actual: unknown, operator: ConditionOperator, expected: ConditionType): unknown {
    if (!Array.isArray(actual)) return actual;
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
        return detail;
      }
    }
    return { matched: false, matchedCount: 0, totalElements: arr.length };
  }

  /**
   * Compact trace detail for a `pattern` condition. For arrays records
   * the first matching element (consistent with the OR + short-circuit
   * semantic of {@link evaluatePattern}).
   */
  private detailForPattern(actual: unknown, regex: string): unknown {
    if (!Array.isArray(actual)) return actual;
    const arr = actual as ReadonlyArray<unknown>;
    const compiled = compileRegex(regex);
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
        return detail;
      }
    }
    return { matched: false, matchedCount: 0, totalElements: arr.length };
  }

  /**
   * Compact trace detail for a `contains` condition.
   * - value variant on array: first element belonging to `value`.
   * - regex variant on array: count of matching elements + up to
   *   {@link MAX_TRACE_MATCHES} sample hits (the rest are dropped from
   *   the trace and a `truncated` flag is raised).
   */
  private detailForContains(actual: unknown, condition: ContainsCondition): unknown {
    if (!Array.isArray(actual)) return actual;
    const arr = actual as ReadonlyArray<unknown>;

    if (condition.regex !== undefined) {
      const compiled = compileRegex(condition.regex);
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
      return detail;
    }

    if (condition.value === undefined) {
      return { matched: false, matchedCount: 0, totalElements: arr.length };
    }
    const candidates = new Set(condition.value.map((v) => valueToString(v)));
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
        return detail;
      }
    }
    return { matched: false, matchedCount: 0, totalElements: arr.length };
  }

  /**
   * Resolves a reference string against the runbook context.
   *
   * Supported formats:
   * - `vars.{name}` - context variable
   * - `steps.{stepId}.output` - step output (supports nested paths)
   * - `params.{name}` - input parameter
   *
   * @param ref - Reference string
   * @param context - Runbook context
   * @returns The resolved value, or undefined if not found
   */
  private resolveRef(ref: string, context: RunbookContext): unknown {
    const parts = ref.split('.');
    const source = parts[0];

    if (source === 'vars') {
      const varName = parts.slice(1).join('.');
      return context.vars.get(varName);
    }

    if (source === 'params') {
      const paramName = parts.slice(1).join('.');
      return context.params.get(paramName);
    }

    if (source === 'steps') {
      const stepId = parts[1];
      if (stepId === undefined) {
        return undefined;
      }
      const stepOutput = context.stepResults.get(stepId);
      if (stepOutput === undefined) {
        return undefined;
      }

      // Navigate deeper: steps.stepId.output, steps.stepId.output[0].field, etc.
      const remainingPath = parts.slice(2).join('.');
      if (remainingPath === '' || remainingPath === 'output') {
        return stepOutput;
      }

      // Remove 'output.' prefix if present
      const fieldPath = remainingPath.startsWith('output.') ? remainingPath.slice('output.'.length) : remainingPath;

      return this.navigatePath(stepOutput, fieldPath);
    }

    return undefined;
  }

  /**
   * Navigates a nested object/array by a dot-separated path.
   * Supports array indexing with bracket notation: `[0].field`.
   *
   * @param obj - Object to navigate
   * @param path - Dot-separated path with optional array indices
   * @returns The value at the path, or undefined
   */
  private navigatePath(obj: unknown, path: string): unknown {
    if (path === '') {
      return obj;
    }

    // Parse path segments, handling [N] array indices
    const segments = path.match(/[^.[\]]+|\[\d+\]/g);
    if (segments === null) {
      return undefined;
    }

    let current: unknown = obj;
    for (const segment of segments) {
      if (current === undefined || current === null) {
        return undefined;
      }

      // Array index: [N]
      const indexMatch = /^\[(\d+)\]$/.exec(segment);
      if (indexMatch !== null) {
        const index = Number(indexMatch[1]);
        if (Array.isArray(current)) {
          current = current[index];
        } else {
          return undefined;
        }
      } else {
        // Object property
        if (typeof current === 'object') {
          current = (current as Record<string, unknown>)[segment];
        } else {
          return undefined;
        }
      }
    }

    return current;
  }
}
