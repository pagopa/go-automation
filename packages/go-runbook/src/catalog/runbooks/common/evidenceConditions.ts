import type { Condition } from '../framework.js';

/** Matches a regex against the serialized evidence produced by one step. */
export function stepEvidenceMatches(stepId: string, regex: string): Condition {
  return { type: 'contains', ref: `steps.${stepId}`, regex };
}

/** Matches a regex against the serialized evidence produced by any listed step. */
export function anyStepEvidenceMatches(stepIds: ReadonlyArray<string>, regex: string): Condition {
  const [firstStepId, ...remainingStepIds] = stepIds;
  if (firstStepId === undefined) {
    throw new Error('At least one evidence step id is required');
  }

  const firstCondition = stepEvidenceMatches(firstStepId, regex);
  if (remainingStepIds.length === 0) return firstCondition;
  return {
    type: 'or',
    conditions: [firstCondition, ...remainingStepIds.map((stepId) => stepEvidenceMatches(stepId, regex))],
  };
}

/** Matches a regex against either standard Lambda log-query step. */
export function lambdaLogEvidenceMatches(regex: string): Condition {
  return anyStepEvidenceMatches(['query-lambda-invocation', 'query-lambda-errors'], regex);
}
