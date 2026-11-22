import type { Condition } from '../../../../../engine/index.js';
import { anyStepEvidenceMatches } from '../../../../../engine/index.js';

/** Matches a regex against either standard Lambda log-query step. */
export function lambdaLogEvidenceMatches(regex: string): Condition {
  return anyStepEvidenceMatches(['query-lambda-invocation', 'query-lambda-errors'], regex);
}
