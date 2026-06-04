/**
 * Runbook: pn-delivery-insert-trigger-eb-lambda-LogInvocationErrors-Alarm
 */

import { lambda } from '@go-automation/go-runbook';
import type { Runbook } from '@go-automation/go-runbook';

import { LAMBDA_FUNCTION, DOWNSTREAMS } from './knownServices.js';
import { DOWNSTREAM_ERROR_PATTERNS } from './knownErrors.js';
import { KNOWN_CASES } from './knownCases.js';

/**
 * Builds the pn-delivery-insert-trigger-eb-lambda-LogInvocationErrors-Alarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildDeliveryInsertTriggerEbLambdaLogInvocationErrorsAlarmRunbook(): Runbook {
  return lambda.createLambdaAlarmRunbook({
    id: 'pn-delivery-insert-trigger-eb-lambda-LogInvocationErrors-Alarm',
    metadata: {
      name: 'ANALISI ALLARME pn-delivery-insert-trigger-eb-lambda-LogInvocationErrors-Alarm',
      description:
        'Gestire in modo standardizzato gli allarmi generati dalla lambda pn-delivery-insert-trigger-eb-lambda',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['lambda', 'pn-delivery-insert-trigger-eb-lambda'],
    },
    lambda: LAMBDA_FUNCTION,
    downstreams: DOWNSTREAMS,
    downstreamErrorPatterns: DOWNSTREAM_ERROR_PATTERNS,
    knownCases: KNOWN_CASES,
  });
}
