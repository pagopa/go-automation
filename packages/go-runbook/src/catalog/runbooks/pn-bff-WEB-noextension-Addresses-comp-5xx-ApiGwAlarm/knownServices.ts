/**
 * Known services for the pn-bff-WEB-noextension-Addresses-comp-5xx-ApiGwAlarm runbook.
 */

import type { apigw } from '../framework.js';

/** API Gateway AccessLog log group on which the alarm fired. */
export const API_GW_LOG_GROUP =
  'pn-bff-microsvc-prod-BffMicroservicePublicWebAPI-8Y6ZXNO6NRW5-PublicApiLogGroup-WgESVfe1onxD';

/**
 * Entry service: the first microservice analysed for any trace that
 * survives API Gateway parsing.
 */
export const ENTRY_SERVICE: apigw.ApiGwService = {
  name: 'pn-bff',
  varPrefix: 'bff',
  logGroup: '/aws/ecs/pn-bff',
  executionLogGroup: 'API-Gateway-Execution-Logs_m93sy9txx7/unique',
};

/** The documented case is identified in BFF logs; no outgoing URL is documented. */
export const REACHABLE_SERVICES: ReadonlyArray<apigw.ApiGwService> = [];
