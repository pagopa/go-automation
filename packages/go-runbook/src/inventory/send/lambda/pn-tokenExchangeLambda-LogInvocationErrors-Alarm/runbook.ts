/**
 * Runbook: pn-tokenExchangeLambda-LogInvocationErrors-Alarm
 */

import { lambda } from '../../../../toolkits/send/index.js';
import type { Runbook } from '../../../../engine/index.js';

import { LAMBDA_FUNCTION, DOWNSTREAMS } from './knownServices.js';
import { DOWNSTREAM_ERROR_PATTERNS } from './downstreamErrorPatterns.js';
import { KNOWN_ERRORS } from './knownErrors.js';

/**
 * Builds the pn-tokenExchangeLambda-LogInvocationErrors-Alarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return lambda.createSendLambdaAlarmRunbook({
    id: 'pn-tokenExchangeLambda-LogInvocationErrors-Alarm',
    metadata: {
      name: 'pn-tokenExchangeLambda-LogInvocationErrors-Alarm',
      description: 'Analizza gli allarmi LogInvocationErrors della lambda pn-tokenExchangeLambda',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['lambda', 'pn-tokenExchangeLambda', 'pn-emd-integration'],
    },
    lambda: LAMBDA_FUNCTION,
    downstreams: DOWNSTREAMS,
    downstreamErrorPatterns: DOWNSTREAM_ERROR_PATTERNS,
    knownErrors: KNOWN_ERRORS,
  });
}
