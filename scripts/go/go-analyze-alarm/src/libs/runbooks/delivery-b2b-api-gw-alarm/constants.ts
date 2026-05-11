/**
 * Constants for the pn-delivery-B2B-ApiGwAlarm runbook.
 *
 * Declarative data only — the pipeline that consumes these constants is
 * built by {@link apigw.createApiGwAlarmRunbook}.
 */

import type { apigw } from '@go-automation/go-runbook';

/** API Gateway AccessLog log group for pn-delivery B2B public API */
export const API_GW_LOG_GROUP =
  'pn-delivery-microsvc-prod-DeliveryMicroservicePublicAPI-1LXSVUHQG11JS-PublicApiLogGroup-Q9vhNTsSTzh7';

/**
 * Minimum status code considered an error.
 *
 * Set to `400` (instead of the canonical `500`) so 4xx errors observed
 * on `pn-ss` (e.g. 403 FORBIDDEN) are also captured. The query template
 * canonically filters `>= 500`, but the runbook PDF explicitly suggests
 * relaxing the threshold for this alarm to surface 4xx evidence.
 */
export const DEFAULT_MIN_STATUS_CODE = 400;

/**
 * Microservices analysed by the runbook, in canonical order. The trace
 * propagates from `pn-delivery` through up to three downstream services
 * (`pn-external-registries`, `pn-data-vault`, `pn-ss`).
 */
export const SERVICES: ReadonlyArray<apigw.ApiGwService> = [
  {
    name: 'pn-delivery',
    logGroup: '/aws/ecs/pn-delivery',
    varPrefix: 'delivery',
    detectNextService: true,
  },
  {
    name: 'pn-external-registries',
    logGroup: '/aws/ecs/pn-external-registries',
    varPrefix: 'externalRegistries',
    continueOnFailure: true,
  },
  {
    name: 'pn-data-vault',
    logGroup: '/aws/ecs/pn-data-vault',
    varPrefix: 'dataVault',
    continueOnFailure: true,
  },
  {
    name: 'pn-ss',
    logGroup: '/aws/ecs/pn-ss',
    varPrefix: 'ss',
    continueOnFailure: true,
  },
];

/**
 * Known URLs are not yet formalised for this alarm in `go-runbooks`.
 * Once the JSON canonical companion is published the registry will be
 * populated; for now we declare an empty registry so the structure of
 * the runbook stays uniform with `address-book-io-api-gw-alarm`.
 */
export const KNOWN_URLS: ReadonlyArray<apigw.KnownUrl> = [];
