/**
 * Runbook: pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm
 */

import { lambda } from '@go-automation/go-runbook';
import type { Runbook } from '@go-automation/go-runbook';

import { LAMBDA_FUNCTION, DOWNSTREAMS } from './knownServices.js';
import { DOWNSTREAM_ERROR_PATTERNS } from './knownErrors.js';
import { KNOWN_CASES } from './knownCases.js';

/**
 * Builds the pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildJwksCacheRefreshLambdaLogInvocationErrorsAlarmRunbook(): Runbook {
  return lambda.createLambdaAlarmRunbook({
    id: 'pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm',
    metadata: {
      name: 'ANALISI ALLARME pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm',
      description: 'Gestire in modo standardizzato gli allarmi generati dalla lambda pn-jwksCacheRefreshLambda',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['lambda', 'pn-jwksCacheRefreshLambda'],
    },
    lambda: LAMBDA_FUNCTION,
    downstreams: DOWNSTREAMS,
    downstreamErrorPatterns: DOWNSTREAM_ERROR_PATTERNS,
    knownCases: KNOWN_CASES,
  });
}
