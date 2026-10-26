/**
 * Constants for the pn-delivery-IO_EXP-ApiGwAlarm runbook.
 */

import type { apigw } from '../framework.js';

import { DELIVERY_API_GW_EXECUTION_LOG_GROUP } from '../constants.js';

// Retain warning stack traces and outgoing calls without collecting DEBUG payloads.
const SERVICE_QUERY = `{{FILTER_CLAUSE}}
| filter level = 'ERROR' or level = 'WARN' or @message like 'Invoking external service'
| sort @timestamp asc
| limit 1000
| display @timestamp, level, @message, trace_id`;

/** API Gateway AccessLog log group for pn-delivery-IO_EXP public API */
export const API_GW_LOG_GROUP =
  'pn-delivery-microsvc-prod-DeliveryMicroservicePublicIoAPI-VKXCJ0RGO2A9-PublicApiLogGroup-7pB9Jdze4wiI';

/**
 * Entry service for requests that reached the application integration.
 */
export const ENTRY_SERVICE: apigw.ApiGwService = {
  name: 'pn-delivery',
  varPrefix: 'delivery',
  logGroup: '/aws/ecs/pn-delivery',
  executionLogGroup: DELIVERY_API_GW_EXECUTION_LOG_GROUP,
  queryOverride: SERVICE_QUERY,
};

/**
 * Additional microservices reachable from {@link ENTRY_SERVICE} through
 * known URLs. Order is irrelevant: each service is entered only when a
 * matching {@link apigw.KnownUrl} is observed in the upstream logs.
 */
export const REACHABLE_SERVICES: ReadonlyArray<apigw.ApiGwService> = [
  { name: 'pn-f24', logGroup: '/aws/ecs/pn-f24', varPrefix: 'f24', queryOverride: SERVICE_QUERY },
  {
    name: 'pn-safestorage',
    logGroup: '/aws/ecs/pn-safe-storage',
    varPrefix: 'safeStorage',
    queryOverride: SERVICE_QUERY,
  },
  {
    name: 'pn-data-vault',
    logGroup: '/aws/ecs/pn-data-vault-sep',
    varPrefix: 'dataVault',
    queryOverride: SERVICE_QUERY,
  },
];
