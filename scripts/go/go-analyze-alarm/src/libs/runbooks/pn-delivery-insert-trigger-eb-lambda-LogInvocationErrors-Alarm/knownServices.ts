/**
 * Known services for the pn-delivery-insert-trigger-eb-lambda-LogInvocationErrors-Alarm runbook.
 */

import type { lambda } from '@go-automation/go-runbook';

/** Entry Lambda whose log group is the primary source. */
export const LAMBDA_FUNCTION: lambda.LambdaFunction = {
  name: 'pn-delivery-insert-trigger-eb-lambda',
  logGroup: '/aws/lambda/pn-delivery-insert-trigger-eb-lambda',
  varPrefix: 'deliveryInsertTriggerEb',
};

/**
 * Downstream microservices reachable from the Lambda. The PDF lists only the
 * Lambda itself among the involved services, so there are no downstreams.
 */
export const DOWNSTREAMS: ReadonlyArray<lambda.LambdaDownstream> = [];
