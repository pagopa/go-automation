/**
 * Known services for the pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm runbook.
 */

import type { lambda } from '@go-automation/go-runbook';

/** Entry Lambda whose log group is the primary source. */
export const LAMBDA_FUNCTION: lambda.LambdaFunction = {
  name: 'pn-slaViolationCheckerLambda-SQS',
  logGroup: '/aws/lambda/pn-slaViolationCheckerLambda-SQS',
  varPrefix: 'slaViolationChecker',
  eventSource: 'sqs',
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
