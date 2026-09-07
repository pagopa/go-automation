/**
 * Known services for the pn-lollipopAuthorizerLambda-LogInvocationErrors-Alarm runbook.
 */

import { SEND_DOWNSTREAMS } from '../framework.js';
import type { lambda } from '../framework.js';

/** Entry Lambda whose log group is the primary source. */
export const LAMBDA_FUNCTION: lambda.LambdaFunction = {
  name: 'pn-lollipopAuthorizerLambda',
  logGroup: '/aws/lambda/pn-lollipopAuthorizerLambda',
  varPrefix: 'lollipopAuthorizer',
  eventSource: 'api-gateway-authorizer',
};

/**
 * Backend services reached by the Lambda.
 *
 * The operational document identifies "BE IO" as the downstream involved in
 * identity-provider key retrieval. It maps to the canonical SEND downstream
 * `AppIO`. No log group is documented, so the runbook classifies the failure
 * without attempting a requestId-correlated query on the backend of IO.
 */
export const DOWNSTREAMS: ReadonlyArray<lambda.LambdaDownstream> = [
  {
    name: SEND_DOWNSTREAMS.APP_IO,
    varPrefix: 'appIoBackend',
  },
];
