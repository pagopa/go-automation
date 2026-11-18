import assert from 'node:assert/strict';

import { ConditionEvaluator } from '../../engine/core/ConditionEvaluator.js';
import type { KnownCase } from '../../engine/types/KnownCase.js';
import type { RunbookContext } from '../../engine/types/RunbookContext.js';

const EVALUATOR = new ConditionEvaluator();

/**
 * Ids of the known cases whose condition holds in a context, highest priority
 * first, as the engine reports them.
 *
 * @param knownCases - Known cases of a runbook
 * @param context - Context to evaluate
 * @returns The ids of the matching cases
 *
 * @example
 * ```typescript
 * assert.deepStrictEqual(matchingCaseIds(KNOWN_CASES, createTestContext({ stepResults })), ['bff-timeout']);
 * ```
 */
export function matchingCaseIds(knownCases: ReadonlyArray<KnownCase>, context: RunbookContext): ReadonlyArray<string> {
  return knownCases
    .filter(({ condition }) => EVALUATOR.evaluate(condition, context))
    .sort((left, right) => right.priority - left.priority)
    .map(({ id }) => id);
}

/**
 * Whether the condition of one known case holds in a context.
 *
 * @param knownCase - Case to evaluate
 * @param context - Context to evaluate
 * @returns The value of the condition
 *
 * @example
 * ```typescript
 * assert.ok(caseMatches(knownCaseById(KNOWN_CASES, 'bff-timeout'), context));
 * ```
 */
export function caseMatches(knownCase: KnownCase, context: RunbookContext): boolean {
  return EVALUATOR.evaluate(knownCase.condition, context);
}

/**
 * The known case with the given id; fails the test when it is missing.
 *
 * @param knownCases - Known cases of a runbook
 * @param id - Case id
 * @returns The case
 *
 * @example
 * ```typescript
 * const knownCase = knownCaseById(KNOWN_CASES, 'bff-timeout');
 * ```
 */
export function knownCaseById(knownCases: ReadonlyArray<KnownCase>, id: string): KnownCase {
  const knownCase = knownCases.find((candidate) => candidate.id === id);
  assert.ok(knownCase !== undefined, `known case not found: ${id}`);
  return knownCase;
}
