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

/** Lambda log group for pn-ioAuthorizerLambda (Livello 0 probe) */
export const IO_AUTHORIZER_LAMBDA_LOG_GROUP = '/aws/lambda/pn-ioAuthorizerLambda';

/** Default time window in minutes (±N from alarm time) */
export const DEFAULT_TIME_WINDOW_MINUTES = 5;

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

/**
 * Known URLs derived from the JSON canonical runbook
 * (`go-runbooks/.../pn-address-book-io-IO-ApiGwAlarm.json`).
 *
 * A `target` matching a service in {@link REACHABLE_SERVICES} (or the
 * {@link ENTRY_SERVICE}) loops the analysis into that service; any other
 * target is treated as an external downstream and terminates the chain.
 */
export const KNOWN_URLS: ReadonlyArray<apigw.KnownUrl> = [
  {
    url: 'https://api.io.pagopa.it/api/v1/activations/',
    matchType: 'prefix',
    target: 'AppIO',
    description: 'Endpoint AppIO osservato nei log di pn-external-registries.',
  },
  {
    url: 'http://internal-EcsA-20230522152202180500000011-96161141.eu-south-1.elb.amazonaws.com:8080/ext-registry-private/io/v1/activations',
    matchType: 'prefix',
    target: 'pn-external-registries',
    description: 'Load balancer interno verso ext-registry-private/io/v1/activations.',
  },
];
