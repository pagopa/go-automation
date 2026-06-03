/**
 * Runbook: pn-ioAuthorizerLambda-LogInvocationErrors-Alarm
 */

import { lambda } from '@go-automation/go-runbook';
import type { Runbook } from '@go-automation/go-runbook';

import { LAMBDA_FUNCTION, DOWNSTREAMS } from './knownServices.js';
import { DOWNSTREAM_ERROR_PATTERNS } from './knownErrors.js';
import { KNOWN_CASES } from './knownCases.js';

/**
 * Builds the pn-ioAuthorizerLambda-LogInvocationErrors-Alarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildIoAuthorizerLambdaRunbook(): Runbook {
  return lambda.createLambdaAlarmRunbook({
    id: 'pn-ioAuthorizerLambda-LogInvocationErrors-Alarm',
    metadata: {
      name: 'ANALISI ALLARME pn-ioAuthorizerLambda-LogInvocationErrors-Alarm',
      description: 'Analizza gli allarmi LogInvocationErrors della lambda pn-ioAuthorizerLambda',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['lambda', 'pn-ioAuthorizerLambda'],
    },
    lambda: LAMBDA_FUNCTION,
    downstreams: DOWNSTREAMS,
    downstreamErrorPatterns: DOWNSTREAM_ERROR_PATTERNS,
    knownCases: KNOWN_CASES,
  });
}
