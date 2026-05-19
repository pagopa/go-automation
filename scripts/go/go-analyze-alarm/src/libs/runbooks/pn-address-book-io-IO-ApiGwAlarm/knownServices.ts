/**
 * Constants for the pn-address-book-io-IO-ApiGwAlarm runbook.
 *
 * Declarative data only — the pipeline that consumes these constants is
 * built by {@link apigw.createApiGwAlarmRunbook}.
 */

import type { apigw } from '@go-automation/go-runbook';

/** API Gateway AccessLog log group for pn-address-book-io public API */
export const API_GW_LOG_GROUP =
  'pn-user-attributes-microsvc-prod-AddressBookMicroservicePublicIoAPI-1C6CG6ZRGH1WD-PublicApiLogGroup-bYfVwP3QLlF0';

/**
 * Entry service: the trace always lands on pn-user-attributes first.
 */
export const ENTRY_SERVICE: apigw.ApiGwService = {
  name: 'pn-user-attributes',
  logGroup: '/aws/ecs/pn-user-attributes',
  varPrefix: 'userAttributes',
};

/**
 * Additional microservices reachable from {@link ENTRY_SERVICE} through
 * known URLs. Order is irrelevant: each service is entered only when a
 * matching {@link apigw.KnownUrl} is observed in the upstream logs.
 */
export const REACHABLE_SERVICES: ReadonlyArray<apigw.ApiGwService> = [
  {
    name: 'pn-data-vault',
    logGroup: '/aws/ecs/pn-data-vault',
    varPrefix: 'dataVault',
  },
  {
    name: 'pn-external-registries',
    logGroup: '/aws/ecs/pn-external-registries',
    varPrefix: 'externalRegistries',
  },
];
