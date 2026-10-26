/**
 * Known services for the pn-stream-delivery-progress-B2B-ApiGwAlarm runbook.
 */

import type { apigw } from '../framework.js';

/** API Gateway AccessLog log group on which the alarm fired. */
export const API_GW_LOG_GROUP =
  'pn-stream-microsvc-prod-DeliveryProgressStreamMicroservicePublicAPI-7C4QX60DSSJ-PublicApiLogGroup-7hNXXQfsXQUN';

export const AUTHORIZER_LOG_GROUP = '/aws/lambda/pn-ApiKeyAuthorizerV2Lambda';
export const VERSIONING_LOG_GROUP = '/aws/lambda/pn-versioningV1V2StreamLambda';

/**
 * Entry service: the first microservice analysed for any trace that
 * survives API Gateway parsing.
 */
export const ENTRY_SERVICE: apigw.ApiGwService = {
  name: 'pn-stream',
  varPrefix: 'stream',
  logGroup: '/aws/ecs/pn-stream',
  executionLogGroup: 'API-Gateway-Execution-Logs_896uiabb64/unique',
};
