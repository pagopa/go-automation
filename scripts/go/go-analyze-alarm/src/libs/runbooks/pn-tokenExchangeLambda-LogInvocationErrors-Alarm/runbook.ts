/**
 * Runbook: pn-tokenExchangeLambda-LogInvocationErrors-Alarm
 */

import { lambda } from '@go-automation/go-runbook';
import type { Runbook } from '@go-automation/go-runbook';

import { LAMBDA_FUNCTION, DOWNSTREAMS } from './knownServices.js';
import { DOWNSTREAM_ERROR_PATTERNS } from './knownErrors.js';
import { KNOWN_CASES } from './knownCases.js';

/**
 * Builds the pn-tokenExchangeLambda-LogInvocationErrors-Alarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildTokenExchangeLambdaRunbook(): Runbook {
  return lambda.createLambdaAlarmRunbook({
    id: 'pn-tokenExchangeLambda-LogInvocationErrors-Alarm',
    metadata: {
      name: 'ANALISI ALLARME pn-tokenExchangeLambda-LogInvocationErrors-Alarm',
      description: 'Analizza gli allarmi LogInvocationErrors della lambda pn-tokenExchangeLambda',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['lambda', 'pn-tokenExchangeLambda', 'pn-emd-integration'],
    },
    lambda: LAMBDA_FUNCTION,
    downstreams: DOWNSTREAMS,
    downstreamErrorPatterns: DOWNSTREAM_ERROR_PATTERNS,
    knownCases: KNOWN_CASES,
  });
}
