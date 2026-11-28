import { valueToString } from '@pagopa/go-common/utils';
import type { Condition } from '../types/Condition.js';
import type { ContainsCondition } from '../types/ContainsCondition.js';
import type { RunbookContext } from '../types/RunbookContext.js';
import { resolveRef } from '../context/resolveRef.js';
import { compileContextRegex } from '../context/compileContextRegex.js';
import { compareValues } from './compareValues.js';
import type { CompareOperator } from './CompareOperator.js';
import type { EvidenceIndices } from './EvidenceIndices.js';
import type { ElementPredicate } from './ElementPredicate.js';
import type { ConditionEvaluationDetails } from './ConditionEvaluationDetails.js';
import type { ConditionEvaluationOptions } from './ConditionEvaluationOptions.js';
import type { ConditionType } from './ConditionType.js';
import type { MatchDetailMulti } from './MatchDetailMulti.js';
import type { MatchDetailSingle } from './MatchDetailSingle.js';
import type { PredicateEvaluation } from './PredicateEvaluation.js';

/**
 * Maximum number of `matchedElements` entries persisted in the trace
 * for a {@link ContainsCondition} regex variant. Picked generously
 * enough to surface a few representative hits while keeping the
 * `caseEvaluations[].resolvedValues` payload small even when a regex
 * matches every row of a multi-thousand-row CloudWatch result.
 */
const MAX_TRACE_MATCHES = 10;

/**
 * Records a resolved value under its ref, keeping earlier entries.
 *
 * The same ref can appear several times in one condition — six `contains` on the
 * same query output is a real case in the catalog — and each occurrence resolves
 * to a different match detail. Keying purely by ref made every occurrence but
 * the last disappear from the trace, which is precisely the information someone
 * reading it is after. Repeats are therefore suffixed with their 1-based
 * position (`ref`, `ref#2`, `ref#3`), matching the order the predicates appear
 * in the `condition` tree that the trace carries alongside.
 */
function recordResolvedValue(values: Record<string, unknown>, ref: string, detail: unknown): void {
  if (!Object.hasOwn(values, ref)) {
    values[ref] = detail;
    return;
  }
  let occurrence = 2;
  while (Object.hasOwn(values, `${ref}#${String(occurrence)}`)) {
    occurrence += 1;
  }
  values[`${ref}#${String(occurrence)}`] = detail;
}

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
   * same traversal. This is used by known-error tracing: large array refs
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
    const collect = options?.withResolvedValues === true;
    const values: Record<string, unknown> = {};
    const evidence: EvidenceIndices = new Map();
    const matched = this.evaluateAndCollect(condition, context, values, collect, evidence);
    if (options?.withResolvedValues === true) {
      return { matched, resolvedValues: values, evidence: matched ? evidence : new Map() };
    }
    return matched;
  }

  /**
   * Walks the condition tree.
   *
   * `collect` drives the two modes the evaluator has to serve. When it is
   * `false` the caller only wants a verdict, so `and` / `or` stop at the first
   * decisive branch and the predicates skip building their trace payload. When
   * it is `true` every branch is visited even after the outcome is settled,
   * because the case trace has to show why the branches that did *not* decide
   * were resolved the way they were.
   */
  private evaluateAndCollect(
    condition: Condition,
    context: RunbookContext,
    values: Record<string, unknown>,
    collect: boolean,
    evidence: EvidenceIndices,
  ): boolean {
    switch (condition.type) {
      case 'compare': {
        const actual = resolveRef(condition.ref, context);
        const result = this.evaluateCompare(actual, condition.operator, condition.value, collect);
        return this.recordPredicate(condition.ref, result, values, collect, evidence);
      }
      case 'pattern': {
        const actual = resolveRef(condition.ref, context);
        const result = this.evaluatePattern(actual, condition.regex, context, collect);
        return this.recordPredicate(condition.ref, result, values, collect, evidence);
      }
      case 'exists': {
        const actual = resolveRef(condition.ref, context);
        const result = this.evaluateExists(actual, collect);
        return this.recordPredicate(condition.ref, result, values, collect, evidence);
      }
      case 'contains': {
        const actual = resolveRef(condition.ref, context);
        const result = this.evaluateContains(actual, condition, context, collect);
        return this.recordPredicate(condition.ref, result, values, collect, evidence);
      }
      case 'and': {
        let matched = true;
        const branches: EvidenceIndices[] = [];
        for (const c of condition.conditions) {
          const branch: EvidenceIndices = new Map();
          if (!this.evaluateAndCollect(c, context, values, collect, branch)) {
            if (!collect) return false;
            matched = false;
          }
          branches.push(branch);
        }
        if (matched) for (const branch of branches) mergeEvidence(evidence, branch);
        return matched;
      }
      case 'or': {
        let matched = false;
        for (const c of condition.conditions) {
          const branch: EvidenceIndices = new Map();
          if (this.evaluateAndCollect(c, context, values, collect, branch)) {
            if (!collect) return true;
            matched = true;
            mergeEvidence(evidence, branch);
          }
        }
        return matched;
      }
      case 'not':
        // A negation proves an absence: it never contributes evidence rows.
        return !this.evaluateAndCollect(condition.condition, context, values, collect, new Map());
      default: {
        const _exhaustive: never = condition;
        throw new Error(`Unknown condition type: ${(_exhaustive as Condition).type}`);
      }
    }
  }

  /**
   * Records the trace detail of a predicate and, when it matched, its evidence indices.
   *
   * @returns Whether the predicate matched
   */
  private recordPredicate(
    ref: string,
    result: PredicateEvaluation,
    values: Record<string, unknown>,
    collect: boolean,
    evidence: EvidenceIndices,
  ): boolean {
    if (!collect) return result.matched;
    recordResolvedValue(values, ref, result.detail);
    if (result.matched && result.indices !== undefined && result.indices.length > 0) {
      const indices = evidence.get(ref) ?? new Set<number>();
      for (const index of result.indices) indices.add(index);
      evidence.set(ref, indices);
    }
    return result.matched;
  }

  private evaluateExists(actual: unknown, collect: boolean): PredicateEvaluation {
    if (!Array.isArray(actual)) {
      const matched = actual !== undefined && actual !== null && valueToString(actual) !== '';
      return collect ? { matched, detail: actual } : { matched };
    }
    const arr = actual as ReadonlyArray<unknown>;
    const matched = arr.length > 0;
    return collect
      ? { matched, detail: { matched, totalElements: arr.length }, indices: arr.map((_element, index) => index) }
      : { matched };
  }

  /**
   * Compact trace detail for a `compare` condition. For scalar refs
   * returns the resolved value as-is. For array refs returns the first
   * element that satisfies the comparison (or `{ matched: false }`).
   */
  private evaluateCompare(
    actual: unknown,
    operator: CompareOperator,
    expected: ConditionType,
    collect: boolean,
  ): PredicateEvaluation {
    if (actual === undefined || actual === null) {
      return { matched: false, detail: actual };
    }
    if (!Array.isArray(actual)) {
      return { matched: compareValues(actual, operator, expected), detail: actual };
    }
    return scanElements(actual as ReadonlyArray<unknown>, (el) => compareValues(el, operator, expected), collect);
  }

  /**
   * Compact trace detail for a `pattern` condition. For arrays records
   * the first matching element; the detailed evaluation also returns the
   * index of every matching element as evidence.
   */
  private evaluatePattern(
    actual: unknown,
    regex: string,
    context: RunbookContext,
    collect: boolean,
  ): PredicateEvaluation {
    if (actual === undefined || actual === null) {
      return { matched: false, detail: actual };
    }
    const compiled = compileContextRegex(context, regex);
    if (!Array.isArray(actual)) {
      return { matched: compiled.test(valueToString(actual)), detail: actual };
    }
    return scanElements(actual as ReadonlyArray<unknown>, (el) => compiled.test(valueToString(el)), collect);
  }

  /**
   * Compact trace detail for a `contains` condition.
   * - value variant on array: first element belonging to `value`.
   * - regex variant on array: count of matching elements + up to
   *   {@link MAX_TRACE_MATCHES} sample hits (the rest are dropped from
   *   the trace and a `truncated` flag is raised).
   */
  private evaluateContains(
    actual: unknown,
    condition: ContainsCondition,
    context: RunbookContext,
    collect: boolean,
  ): PredicateEvaluation {
    if (actual === undefined || actual === null) {
      return { matched: false, detail: actual };
    }
    if (condition.regex !== undefined) {
      const compiled = compileContextRegex(context, condition.regex);
      if (!Array.isArray(actual)) {
        return { matched: compiled.test(valueToString(actual)), detail: actual };
      }
      const arr = actual as ReadonlyArray<unknown>;
      let matchedCount = 0;
      const samples: { index: number; element: unknown }[] = [];
      const indices: number[] = [];
      for (let i = 0; i < arr.length; i++) {
        const el = arr[i];
        if (el === undefined || el === null) continue;
        if (compiled.test(valueToString(el))) {
          // A verdict needs one hit; the count and the indices only exist for the trace and the evidence.
          if (!collect) return { matched: true };
          matchedCount += 1;
          indices.push(i);
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
      return { matched: detail.matched, detail, indices };
    }

    const candidates = new Set(condition.value.map((v) => valueToString(v)));
    if (!Array.isArray(actual)) {
      return { matched: candidates.has(valueToString(actual)), detail: actual };
    }
    return scanElements(actual as ReadonlyArray<unknown>, (el) => candidates.has(valueToString(el)), collect);
  }
}

/**
 * Applies a predicate element-wise with OR semantics.
 *
 * Without `collect` it stops at the first hit. With `collect` it visits every element: the trace keeps the first
 * hit, as before, and the evidence receives the index of every hit.
 *
 * @param arr - Elements of the array ref
 * @param predicate - Test of a single non-null element
 * @param collect - Whether the trace detail and the evidence indices are wanted
 * @returns The evaluation of the predicate over the array
 */
function scanElements(arr: ReadonlyArray<unknown>, predicate: ElementPredicate, collect: boolean): PredicateEvaluation {
  let first: MatchDetailSingle | undefined;
  const indices: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    const el = arr[i];
    if (el === undefined || el === null || !predicate(el)) continue;
    if (!collect) return { matched: true };
    first ??= { matched: true, matchedIndex: i, matchedElement: el, totalElements: arr.length };
    indices.push(i);
  }
  if (first !== undefined) return { matched: true, detail: first, indices };
  return collect
    ? { matched: false, detail: { matched: false, matchedCount: 0, totalElements: arr.length } }
    : { matched: false };
}

/**
 * Adds the evidence of a satisfied branch to the evidence of its parent.
 *
 * @param target - Evidence of the parent condition
 * @param source - Evidence of the satisfied branch
 */
function mergeEvidence(target: EvidenceIndices, source: EvidenceIndices): void {
  for (const [ref, indices] of source) {
    const merged = target.get(ref) ?? new Set<number>();
    for (const index of indices) merged.add(index);
    target.set(ref, merged);
  }
}

/**
 * Shared {@link ConditionEvaluator} instance.
 *
 * `ConditionEvaluator` is stateless — every method is pure — so a single
 * instance can be reused everywhere instead of allocating one per step or
 * per `execute()` call.
 */
export const sharedConditionEvaluator: ConditionEvaluator = new ConditionEvaluator();
