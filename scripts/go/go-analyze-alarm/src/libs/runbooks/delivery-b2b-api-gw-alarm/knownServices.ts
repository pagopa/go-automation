/**
 * Constants for the pn-delivery-b2b-api-gw-alarm runbook.
 *
 * Declarative data only — the pipeline that consumes these constants is
 * built by {@link apigw.createApiGwAlarmRunbook}.
 */

import type { apigw } from '@go-automation/go-runbook';

/** API Gateway AccessLog log group for the pn-delivery B2B public API */
export const API_GW_LOG_GROUP =
  'pn-delivery-microsvc-prod-DeliveryMicroservicePublicAPI-1LXSVUHQG11JS-PublicApiLogGroup-Q9vhNTsSTzh7';

/**
 * Entry service: the trace always lands on pn-delivery first.
 */
export const ENTRY_SERVICE: apigw.ApiGwService = {
  name: 'pn-delivery',
  varPrefix: 'delivery',
  logGroup: '/aws/ecs/pn-delivery',
  executionLogGroup: 'API-Gateway-Execution-Logs_64pohg7bg0/unique',
};

/**
 * Additional microservices reachable from {@link ENTRY_SERVICE} through
 * known URLs. Order is irrelevant: each service is entered only when a
 * matching {@link apigw.KnownUrl} is observed in the upstream logs.
 */
export const REACHABLE_SERVICES: ReadonlyArray<apigw.ApiGwService> = [
  {
    name: 'pn-data-vault',
    logGroup: '/aws/ecs/pn-data-vault-sep',
    varPrefix: 'dataVault',
  },
];
