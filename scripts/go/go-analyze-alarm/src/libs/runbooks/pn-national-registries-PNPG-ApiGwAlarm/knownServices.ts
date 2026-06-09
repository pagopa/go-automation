/**
 * Known services for the pn-national-registries-PNPG-ApiGwAlarm runbook.
 */

import type { apigw } from '@go-automation/go-runbook';

/** API Gateway AccessLog log group on which the alarm fired. */
export const API_GW_LOG_GROUP =
  'pn-national-registries-microsvc-prod-NationalRegistryApiGateway-RO4SZA9UVEZ2-PublicApiLogGroup-RiRBuxKlpAEa';

/**
 * Entry service: the first microservice analysed for any trace that
 * survives API Gateway parsing.
 */
export const ENTRY_SERVICE: apigw.ApiGwService = {
  name: 'pn-national-registries',
  varPrefix: 'nationalRegistries',
  logGroup: '/aws/ecs/pn-national-registries',
};

/**
 * Additional microservices reachable from {@link ENTRY_SERVICE} through
 * known URLs. Order is irrelevant: each service is entered only when a
 * matching {@link apigw.KnownUrl} observed in the upstream logs points to it.
 */
export const REACHABLE_SERVICES: ReadonlyArray<apigw.ApiGwService> = [];
