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
 * Microservices analysed by the runbook, in the canonical order:
 * `pn-user-attributes → pn-data-vault → pn-external-registries`.
 *
 * `continueOnFailure` defaults to `false` on the first service (the entry
 * point of the trace) and `true` on the rest (the trace might not reach
 * them — see V02 plan §5.3).
 */
export const SERVICES: ReadonlyArray<apigw.ApiGwService> = [
  {
    name: 'pn-user-attributes',
    logGroup: '/aws/ecs/pn-user-attributes',
    varPrefix: 'userAttributes',
    detectNextService: true,
  },
  {
    name: 'pn-data-vault',
    logGroup: '/aws/ecs/pn-data-vault',
    varPrefix: 'dataVault',
    detectNextService: true,
    continueOnFailure: true,
  },
  {
    name: 'pn-external-registries',
    logGroup: '/aws/ecs/pn-external-registries',
    varPrefix: 'externalRegistries',
    continueOnFailure: true,
  },
];

/**
 * Known URLs derived from the JSON canonical runbook
 * (`go-runbooks/.../pn-address-book-io-IO-ApiGwAlarm.json`).
 *
 * The internal entry must reference a service present in {@link SERVICES}
 * so that `<prefix>UrlNeedsRoutingFix` stays `false` when a real trace
 * lands on it.
 */
export const KNOWN_URLS: ReadonlyArray<apigw.KnownUrl> = [
  {
    kind: 'external',
    url: 'https://api.io.pagopa.it/api/v1/activations/',
    matchType: 'prefix',
    downstream: 'AppIO',
    description: 'Endpoint AppIO osservato nei log di pn-external-registries.',
  },
  {
    kind: 'internal',
    url: 'http://internal-EcsA-20230522152202180500000011-96161141.eu-south-1.elb.amazonaws.com:8080/ext-registry-private/io/v1/activations',
    matchType: 'prefix',
    service: 'pn-external-registries',
    description: 'Load balancer interno verso ext-registry-private/io/v1/activations.',
  },
];
