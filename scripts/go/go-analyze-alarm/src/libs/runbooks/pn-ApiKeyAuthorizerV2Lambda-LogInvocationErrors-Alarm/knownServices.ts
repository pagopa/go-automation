/**
 * Known services for the pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm runbook.
 */

import type { lambda } from '@go-automation/go-runbook';

/** Entry Lambda whose log group is the primary source. */
export const LAMBDA_FUNCTION: lambda.LambdaFunction = {
  name: 'pn-ApiKeyAuthorizerV2Lambda',
  logGroup: '/aws/lambda/pn-ApiKeyAuthorizerV2Lambda',
  varPrefix: 'apikeyauthorizerv2lambda',
};

/**
 * Downstream microservices reachable from the Lambda. Each entry is queried
 * by the Lambda requestId only when a {@link lambda.DownstreamErrorPattern}
 * (see knownErrors.ts) routes to it and a `logGroup` is provided.
 *
 * TODO: add reachable downstream services as the analysis surfaces them.
 */
export const DOWNSTREAMS: ReadonlyArray<lambda.LambdaDownstream> = [
  // {
  //   name: 'pn-some-service',
  //   varPrefix: 'someService',
  //   logGroup: '/aws/ecs/pn-some-service',
  // },
];
