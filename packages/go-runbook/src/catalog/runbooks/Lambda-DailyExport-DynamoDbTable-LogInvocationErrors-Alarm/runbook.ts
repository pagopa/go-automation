/**
 * Runbook: Lambda-DailyExport-DynamoDbTable-LogInvocationErrors-Alarm
 */

import { lambda } from '../framework.js';
import type { Runbook } from '../framework.js';

import { LAMBDA_FUNCTION } from './knownServices.js';
import { DOWNSTREAM_ERROR_PATTERNS } from './knownErrors.js';
import { KNOWN_CASES } from './knownCases.js';
import { QueryDailyExportAccountsStep } from './QueryDailyExportAccountsStep.js';

/**
 * Builds the Lambda-DailyExport-DynamoDbTable-LogInvocationErrors-Alarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return lambda.createLambdaAlarmRunbook({
    id: 'Lambda-DailyExport-DynamoDbTable-LogInvocationErrors-Alarm',
    metadata: {
      name: 'Lambda-DailyExport-DynamoDbTable-LogInvocationErrors-Alarm',
      description: 'Analizza gli errori della Lambda DailyExport DynamoDB negli account core e confinfo.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['lambda', 'dynamodb', 'daily-export', 'core', 'confinfo'],
    },
    lambda: LAMBDA_FUNCTION,
    errorQueryStep: new QueryDailyExportAccountsStep('errors'),
    invocationQueryStep: new QueryDailyExportAccountsStep('invocation'),
    downstreamErrorPatterns: DOWNSTREAM_ERROR_PATTERNS,
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      runbookName: 'Lambda-DailyExport-DynamoDbTable-LogInvocationErrors-Alarm',
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3411443959/Lambda-DailyExport-DynamoDbTable-LogInvocationErrors-Alarm',
          name: 'Lambda-DailyExport-DynamoDbTable-LogInvocationErrors-Alarm',
          type: 'CONFLUENCE',
        },
      ],
    },
  });
}
