/**
 * Constants for the pn-delivery-push-B2B-ApiGwAlarm runbook.
 */

import type { apigw } from '@go-automation/go-runbook';

/** API Gateway AccessLog log group for pn-delivery-push B2B public API */
export const API_GW_LOG_GROUP =
  'pn-delivery-push-microsvc-prod-DeliveryPushMicroservicePublicAPI-1RDV2OUR6YHIN-PublicApiLogGroup-DJFkmNW2FvW0';

/**
 * Entry service: the trace always lands on pn-delivery-push first.
 */
export const ENTRY_SERVICE: apigw.ApiGwService = {
  name: 'pn-delivery-push',
  varPrefix: 'deliveryPush',
  logGroup: '/aws/ecs/pn-delivery-push',
};

/**
 * Additional microservices reachable from {@link ENTRY_SERVICE} through
 * known URLs. Order is irrelevant: each service is entered only when a
 * matching {@link apigw.KnownUrl} is observed in the upstream logs.
 */
export const REACHABLE_SERVICES: ReadonlyArray<apigw.ApiGwService> = [
  {
    name: 'pn-safestorage',
    logGroup: '/aws/ecs/pn-ss',
    varPrefix: 'safestorage',
  },
  {
    name: 'pn-data-vault',
    logGroup: '/aws/ecs/pn-data-vault-sep',
    varPrefix: 'dataVault',
  },
];
