import type { lambda } from '../framework.js';

/** Lambda deployed in both the SEND core and confinfo accounts. */
export const LAMBDA_FUNCTION: lambda.LambdaFunction = {
  name: 'pn-downstream-monitoring-lambda',
  logGroup: '/aws/lambda/pn-downstream-monitoring-lambda',
  varPrefix: 'downstreamMonitoring',
};

/** The two production accounts that own the identically named Lambda log group. */
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

/** The documented SlowDown is an AWS service error, not a correlated SEND microservice. */
export const DOWNSTREAMS: ReadonlyArray<lambda.LambdaDownstream> = [];
