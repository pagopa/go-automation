/**
 * Known services for the pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm runbook.
 */

import type { lambda } from '@go-automation/go-runbook';

/** Entry Lambda whose log group is the primary source. */
export const LAMBDA_FUNCTION: lambda.LambdaFunction = {
  name: 'pn-jwksCacheRefreshLambda',
  logGroup: '/aws/lambda/pn-jwksCacheRefreshLambda',
  varPrefix: 'jwksCacheRefresh',
};

/**
 * Downstream microservices reachable from the Lambda. Each entry is queried
 * by the Lambda requestId only when a {@link lambda.DownstreamErrorPattern}
 * (see knownErrors.ts) routes to it and a `logGroup` is provided.
 *
 * The documented failures are external JWKS URL failures, not calls to
 * internal microservices with correlated logs.
 */
export const DOWNSTREAMS: ReadonlyArray<lambda.LambdaDownstream> = [];
