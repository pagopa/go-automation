/**
 * Known services for the pn-jwtAuthorizerLambda-LogInvocationErrors-Alarm runbook.
 */

import type { lambda } from '../../../../toolkits/send/index.js';

/** Entry Lambda whose log group is the primary source. */
export const LAMBDA_FUNCTION: lambda.LambdaFunction = {
  name: 'pn-jwtAuthorizerLambda',
  logGroup: '/aws/lambda/pn-jwtAuthorizerLambda',
  varPrefix: 'jwtAuthorizer',
  eventSource: 'api-gateway-authorizer',
};
