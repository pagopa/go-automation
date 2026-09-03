/**
 * Runbook: pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm
 */

import { lambda } from '../framework.js';
import type { Runbook } from '../framework.js';

import { LAMBDA_FUNCTION, DOWNSTREAMS } from './knownServices.js';
import { DOWNSTREAM_ERROR_PATTERNS } from './knownErrors.js';
import { KNOWN_CASES } from './knownCases.js';

/**
 * Builds the pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return lambda.createLambdaAlarmRunbook({
    id: 'pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm',
    metadata: {
      name: 'pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm',
      description: 'Gestire in modo standardizzato gli allarmi generati dalla lambda pn-ApiKeyAuthorizerV2Lambda',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['lambda', 'pn-ApiKeyAuthorizerV2Lambda', 'pn-stream'],
    },
    lambda: LAMBDA_FUNCTION,
    downstreams: DOWNSTREAMS,
    downstreamErrorPatterns: DOWNSTREAM_ERROR_PATTERNS,
    knownCases: KNOWN_CASES,
  });
}
