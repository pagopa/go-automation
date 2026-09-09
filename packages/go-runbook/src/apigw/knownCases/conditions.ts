import type { Condition } from '../../types/Condition.js';

/** Matches the canonical status-code variable populated by API Gateway runbooks. */
export function apiGwStatusIs(status: string): Condition {
  return { type: 'compare', ref: 'vars.apiGwStatusCode', operator: '==', value: status };
}

/** Matches the canonical request-path variable populated by API Gateway runbooks. */
export function apiGwPathMatches(regex: string): Condition {
  return { type: 'pattern', ref: 'vars.apiGwPath', regex };
}
