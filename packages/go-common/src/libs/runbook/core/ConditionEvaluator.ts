import { valueToString } from '../../core/index.js';
import type { Condition } from '../types/Condition.js';
import type { RunbookContext } from '../types/RunbookContext.js';

// Condition operators for compare conditions
type ConditionOperator = '==' | '!=' | '>' | '<' | '>=' | '<=';

// Condition types supported by the evaluator
type ConditionType = string | number | boolean;

/**
 * Evaluates conditions against the runbook context.
 * Supports reference resolution for vars, step outputs, and params.
 *
 * Reference format:
 * - `'vars.{name}'`           -> variable from context
 * - `'steps.{stepId}.output'` -> output of a previous step
 * - `'params.{name}'`         -> runbook input parameter
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
   * Evaluates a compare condition.
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

    const actualStr = valueToString(actual);
    const expectedStr = valueToString(expected);

    // For numeric comparison when both values are numeric
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
   * Evaluates a pattern condition using regex.
   */
  private evaluatePattern(ref: string, regex: string, context: RunbookContext): boolean {
    const actual = this.resolveRef(ref, context);
    if (actual === undefined || actual === null) {
      return false;
    }
    const compiled = this.compileRegex(regex);
    const actualStr = valueToString(actual);
    return compiled.test(actualStr);
  }

  /**
   * Safely compiles a regex pattern, throwing a descriptive error for invalid patterns.
   *
   * @param pattern - The regex pattern string to compile
   * @returns The compiled RegExp
   * @throws Error if the pattern is invalid
   */
  private compileRegex(pattern: string): RegExp {
    try {
      // eslint-disable-next-line security/detect-non-literal-regexp -- Pattern comes from runbook config (trusted), validated here
      return new RegExp(pattern);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid regex pattern "${pattern}": ${message}`, { cause: err });
    }
  }

  /**
   * Evaluates an exists condition.
   * Returns true if the value is not undefined, not null, and not an empty string.
   */
  private evaluateExists(ref: string, context: RunbookContext): boolean {
    const actual = this.resolveRef(ref, context);
    const actualStr = valueToString(actual);
    return actual !== undefined && actual !== null && actualStr !== '';
  }

  /**
   * Recursively collects all reference values from a condition tree.
   */
  private collectRefs(condition: Condition, context: RunbookContext, values: Record<string, unknown>): void {
    switch (condition.type) {
      case 'compare':
        values[condition.ref] = this.resolveRef(condition.ref, context);
        break;
      case 'pattern':
        values[condition.ref] = this.resolveRef(condition.ref, context);
        break;
      case 'exists':
        values[condition.ref] = this.resolveRef(condition.ref, context);
        break;
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
