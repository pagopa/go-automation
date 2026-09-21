import type { lambda } from '../framework.js';

/** Lambda deployed in both the SEND core and confinfo accounts. */
export const LAMBDA_FUNCTION: lambda.LambdaFunction = {
  name: 'pn-downstream-monitoring-lambda',
  logGroup: '/aws/lambda/pn-downstream-monitoring-lambda',
  varPrefix: 'downstreamMonitoring',
  eventSource: 'cloudwatch-logs',
  configuredTimeoutMs: 60_000,
};

/** The documented SlowDown is an AWS service error, not a correlated SEND microservice. */
export const DOWNSTREAMS: ReadonlyArray<lambda.LambdaDownstream> = [];
