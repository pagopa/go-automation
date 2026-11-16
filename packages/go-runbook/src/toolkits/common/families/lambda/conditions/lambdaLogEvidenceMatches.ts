import type { Condition } from '../../../../../engine/types/Condition.js';
import { anyStepEvidenceMatches } from '../../../../../engine/conditions/evidenceConditions.js';

/** Matches a regex against either standard Lambda log-query step. */
export function lambdaLogEvidenceMatches(regex: string): Condition {
  return anyStepEvidenceMatches(['query-lambda-invocation', 'query-lambda-errors'], regex);
}
