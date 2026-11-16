/**
 * Runbook: Lambda-DailyExport-DynamoDbTable-LogInvocationErrors-Alarm
 */

import { lambda } from '../../../../toolkits/send/index.js';
import type { Runbook } from '../../../../engine/index.js';

import { LAMBDA_FUNCTION } from './knownServices.js';
import { DOWNSTREAM_ERROR_PATTERNS } from './knownErrors.js';
import { KNOWN_CASES } from './knownCases.js';
import { LAMBDA_LOG_READER } from './lambdaLogReader.js';

/**
 * Builds the Lambda-DailyExport-DynamoDbTable-LogInvocationErrors-Alarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return lambda.createSendLambdaAlarmRunbook({
    id: 'Lambda-DailyExport-DynamoDbTable-LogInvocationErrors-Alarm',
    metadata: {
      name: 'Lambda-DailyExport-DynamoDbTable-LogInvocationErrors-Alarm',
      description: 'Analizza gli errori della Lambda DailyExport DynamoDB nelle sorgenti configurate.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['lambda', 'dynamodb', 'daily-export'],
    },
    lambda: LAMBDA_FUNCTION,
    errorQueryStep: new lambda.QueryLambdaAcrossAccountsStep({ ...LAMBDA_LOG_READER, queryKind: 'errors' }),
    invocationQueryStep: new lambda.QueryLambdaAcrossAccountsStep({ ...LAMBDA_LOG_READER, queryKind: 'invocation' }),
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
