/**
 * Constants for the pn-address-book-io-IO-ApiGwAlarm runbook.
 *
 * Declarative data only — the pipeline that consumes these constants is
 * built by {@link apigw.createApiGwAlarmRunbook}.
 */

import type { apigw } from '@go-automation/go-runbook';

/** API Gateway AccessLog log group for pn-delivery-IO_EXP public API */
export const API_GW_LOG_GROUP =
  'pn-delivery-microsvc-prod-DeliveryMicroservicePublicIoAPI-VKXCJ0RGO2A9-PublicApiLogGroup-7pB9Jdze4wiI';

/** Lambda log group for pn-ioAuthorizerLambda (Livello 0 probe) */
export const IO_AUTHORIZER_LAMBDA_LOG_GROUP = '/aws/lambda/pn-ioAuthorizerLambda';

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
