/**
 * Runbook: pn-jwtAuthorizerLambda-LogInvocationErrors-Alarm
 */

import { lambda } from '../framework.js';
import type { Runbook } from '../framework.js';

import { LAMBDA_FUNCTION } from './knownServices.js';
import { KNOWN_CASES } from './knownCases.js';

/**
 * Builds the pn-jwtAuthorizerLambda-LogInvocationErrors-Alarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return lambda.createLambdaAlarmRunbook({
    id: 'pn-jwtAuthorizerLambda-LogInvocationErrors-Alarm',
    metadata: {
      name: 'pn-jwtAuthorizerLambda-LogInvocationErrors-Alarm',
      description: 'Diagnosi degli errori IAM, KMS e Redis di pn-jwtAuthorizerLambda',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['lambda', 'pn-jwtAuthorizerLambda', 'authorization'],
    },
    lambda: LAMBDA_FUNCTION,
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      runbookName: 'pn-jwtAuthorizerLambda-LogInvocationErrors-Alarm',
      finalActions: [],
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3028910156/pn-jwtAuthorizerLambda-LogInvocationErrors-Alarm',
          name: 'pn-jwtAuthorizerLambda-LogInvocationErrors-Alarm',
          type: 'CONFLUENCE',
        },
      ],
    },
  });
}
