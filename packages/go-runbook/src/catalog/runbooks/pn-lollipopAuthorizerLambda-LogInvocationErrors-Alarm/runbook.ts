/**
 * Runbook: pn-lollipopAuthorizerLambda-LogInvocationErrors-Alarm
 */

import { lambda } from '../framework.js';
import type { Runbook } from '../framework.js';

import { LAMBDA_FUNCTION, DOWNSTREAMS } from './knownServices.js';
import { DOWNSTREAM_ERROR_PATTERNS } from './knownErrors.js';
import { KNOWN_CASES } from './knownCases.js';

/**
 * Builds the pn-lollipopAuthorizerLambda-LogInvocationErrors-Alarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return lambda.createLambdaAlarmRunbook({
    id: 'pn-lollipopAuthorizerLambda-LogInvocationErrors-Alarm',
    metadata: {
      name: 'pn-lollipopAuthorizerLambda-LogInvocationErrors-Alarm',
      description: 'Gestire in modo standardizzato gli allarmi generati dalla lambda pn-lollipopAuthorizerLambda',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['lambda', 'pn-lollipopAuthorizerLambda', 'AppIO'],
    },
    lambda: LAMBDA_FUNCTION,
    downstreams: DOWNSTREAMS,
    downstreamErrorPatterns: DOWNSTREAM_ERROR_PATTERNS,
    knownCases: KNOWN_CASES,
  });
}
