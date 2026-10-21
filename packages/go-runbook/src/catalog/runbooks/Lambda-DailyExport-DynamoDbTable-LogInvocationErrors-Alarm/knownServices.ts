import type { lambda } from '../framework.js';

export const LAMBDA_FUNCTION: lambda.LambdaFunction = {
  name: 'Lambda-DailyExport-DynamoDbTable',
  logGroup: '/aws/lambda/Lambda-DailyExport-DynamoDbTable',
  varPrefix: 'dailyExport',
};

/** Verified production identities; the same log group exists in both accounts. */
export const LAMBDA_LOG_SOURCES = [
  {
    name: 'core',
    accountId: '510769970275',
    profiles: ['sso_pn-core-prod_readonly', 'sso_pn-core-prod', 'pn-core-prod'],
  },
  {
    name: 'confinfo',
    accountId: '350578575906',
    profiles: ['sso_pn-confinfo-prod'],
  },
] as const;
