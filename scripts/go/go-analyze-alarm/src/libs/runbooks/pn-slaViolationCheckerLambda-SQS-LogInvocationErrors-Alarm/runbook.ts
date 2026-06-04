/**
 * Runbook: pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm
 */

import { lambda } from '@go-automation/go-runbook';
import type { Runbook } from '@go-automation/go-runbook';

import { LAMBDA_FUNCTION, DOWNSTREAMS } from './knownServices.js';
import { DOWNSTREAM_ERROR_PATTERNS } from './knownErrors.js';
import { KNOWN_CASES } from './knownCases.js';

/**
 * Builds the pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildSlaViolationCheckerLambdaSqsRunbook(): Runbook {
  return lambda.createLambdaAlarmRunbook({
    id: 'pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm',
    metadata: {
      name: 'ANALISI ALLARME pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm',
      description: 'Analizza gli allarmi LogInvocationErrors della lambda pn-slaViolationCheckerLambda-SQS',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['lambda', 'pn-slaViolationCheckerLambda-SQS', 'sqs'],
    },
    lambda: LAMBDA_FUNCTION,
    downstreams: DOWNSTREAMS,
    downstreamErrorPatterns: DOWNSTREAM_ERROR_PATTERNS,
    knownCases: KNOWN_CASES,
  });
}
