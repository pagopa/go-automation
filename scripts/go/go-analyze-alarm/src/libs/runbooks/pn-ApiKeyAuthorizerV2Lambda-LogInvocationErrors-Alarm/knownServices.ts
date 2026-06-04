/**
 * Known services for the pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm runbook.
 */

import type { lambda } from '@go-automation/go-runbook';

/** Entry Lambda whose log group is the primary source. */
export const LAMBDA_FUNCTION: lambda.LambdaFunction = {
  name: 'pn-ApiKeyAuthorizerV2Lambda',
  logGroup: '/aws/lambda/pn-ApiKeyAuthorizerV2Lambda',
  varPrefix: 'apiKeyAuthorizerV2',
};

/**
 * Downstream microservices reachable from the Lambda. Each entry is queried
 * by the Lambda requestId only when a {@link lambda.DownstreamErrorPattern}
 * (see knownErrors.ts) routes to it and a `logGroup` is provided.
 *
 * The PDF lists pn-stream as involved service, but does not define a
 * correlated log query. Keep it without logGroup so the runbook classifies the
 * downstream without attempting a CloudWatch query by Lambda requestId.
 */
export const DOWNSTREAMS: ReadonlyArray<lambda.LambdaDownstream> = [
  {
    name: 'pn-stream',
    varPrefix: 'stream',
  },
];
