import type { lambda } from '../../../../toolkits/send/index.js';

/** Lambda deployed in both the SEND core and confinfo accounts. */
export const LAMBDA_FUNCTION: lambda.LambdaFunction = {
  name: 'pn-downstream-monitoring-lambda',
  logGroup: '/aws/lambda/pn-downstream-monitoring-lambda',
  varPrefix: 'downstreamMonitoring',
  eventSource: 'cloudwatch-logs',
  configuredTimeoutMs: 60_000,
};

/**
 * The two production accounts that own the identically named Lambda log group.
 * Provisional runbook-local data (EVO-AWSACCT-OPUS-01 A0): replaced by logical accounts in A4.
 */
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
