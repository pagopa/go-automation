/**
 * Constants for the pn-delivery-B2B-ApiGwAlarm runbook.
 */

import type { apigw } from '../framework.js';

import { DELIVERY_API_GW_EXECUTION_LOG_GROUP } from '../constants.js';

const EXTERNAL_REGISTRIES_QUERY = `{{FILTER_CLAUSE}}
| filter level == 'ERROR' or @message like 'Invoking external service Selfcare'
| limit 1000
| display @timestamp, level, ms, @message, trace_id`;

const DATA_VAULT_QUERY = `{{FILTER_CLAUSE}}
| filter level == 'ERROR'
    or @message like 'Successful API operation: RecipientsApi._getRecipientDenominationByInternalId'
    or @message like 'Ending process _getRecipientDenominationByInternalId'
| limit 1000
| display @timestamp, level, ms, @message, trace_id`;

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
  executionLogGroup: DELIVERY_API_GW_EXECUTION_LOG_GROUP,
};

/**
 * Additional microservices reachable from {@link ENTRY_SERVICE} through
 * known URLs. Order is irrelevant: each service is entered only when a
 * matching {@link apigw.KnownUrl} is observed in the upstream logs.
 */
export const REACHABLE_SERVICES: ReadonlyArray<apigw.ApiGwService> = [
  {
    name: 'pn-external-registries',
    logGroup: '/aws/ecs/pn-external-registries',
    varPrefix: 'externalRegistries',
    queryOverride: EXTERNAL_REGISTRIES_QUERY,
  },
  {
    name: 'pn-data-vault',
    logGroup: '/aws/ecs/pn-data-vault-sep',
    varPrefix: 'dataVault',
    queryOverride: DATA_VAULT_QUERY,
  },
  {
    name: 'pn-f24',
    logGroup: '/aws/ecs/pn-f24',
    varPrefix: 'f24',
  },
  {
    name: 'pn-safestorage',
    logGroup: '/aws/ecs/pn-safe-storage',
    varPrefix: 'safeStorage',
  },
];
