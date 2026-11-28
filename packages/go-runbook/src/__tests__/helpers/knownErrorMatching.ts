import assert from 'node:assert/strict';

import { ConditionEvaluator } from '../../engine/core/ConditionEvaluator.js';
import type { KnownError } from '../../engine/types/KnownError.js';
import type { RunbookContext } from '../../engine/types/RunbookContext.js';

const EVALUATOR = new ConditionEvaluator();

/**
 * Ids of the known errors whose condition holds in a context, in declaration
 * order, without the cases another matching case supersedes: the detections the
 * engine reports for an untimed context.
 *
 * @param knownErrors - Known errors of a runbook
 * @param context - Context to evaluate
 * @returns The ids of the matching cases
 *
 * @example
 * ```typescript
 * assert.deepStrictEqual(matchingKnownErrorCodes(KNOWN_ERRORS, createTestContext({ stepResults })), ['bff-timeout']);
 * ```
 */
export function matchingKnownErrorCodes(
  knownErrors: ReadonlyArray<KnownError>,
  context: RunbookContext,
): ReadonlyArray<string> {
  const matching = knownErrors.filter(({ condition }) => EVALUATOR.evaluate(condition, context));
  const superseded = new Set(matching.flatMap(({ supersedes }) => supersedes ?? []));
  return matching.filter(({ code }) => !superseded.has(code)).map(({ code }) => code);
}

/**
 * Whether the condition of one known error holds in a context.
 *
 * @param knownError - Case to evaluate
 * @param context - Context to evaluate
 * @returns The value of the condition
 *
 * @example
 * ```typescript
 * assert.ok(caseMatches(knownErrorById(KNOWN_ERRORS, 'bff-timeout'), context));
 * ```
 */
export function caseMatches(knownError: KnownError, context: RunbookContext): boolean {
  return EVALUATOR.evaluate(knownError.condition, context);
}

/**
 * The known error with the given id; fails the test when it is missing.
 *
 * @param knownErrors - Known errors of a runbook
 * @param id - Case id
 * @returns The case
 *
 * @example
 * ```typescript
 * const knownError = knownErrorById(KNOWN_ERRORS, 'bff-timeout');
 * ```
 */
export function knownErrorById(knownErrors: ReadonlyArray<KnownError>, id: string): KnownError {
  const knownError = knownErrors.find((candidate) => candidate.code === id);
  assert.ok(knownError !== undefined, `known error not found: ${id}`);
  return knownError;
}
