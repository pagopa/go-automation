/**
 * Constants for the pn-delivery-B2B-ApiGwAlarm runbook.
 */

/** API Gateway AccessLog log group for pn-delivery B2B public API */
export const API_GW_LOG_GROUP =
  'pn-delivery-microsvc-prod-DeliveryMicroservicePublicAPI-1LXSVUHQG11JS-PublicApiLogGroup-Q9vhNTsSTzh7';

/** ECS log group for pn-delivery */
export const DELIVERY_LOG_GROUP = '/aws/ecs/pn-delivery';

/** ECS log group for pn-external-registries */
export const EXTERNAL_REGISTRIES_LOG_GROUP = '/aws/ecs/pn-external-registries';

/** ECS log group for pn-data-vault */
export const DATA_VAULT_LOG_GROUP = '/aws/ecs/pn-data-vault';

/** ECS log group for pn-ss (safe storage) */
export const SS_LOG_GROUP = '/aws/ecs/pn-ss';

/**
 * Default minimum HTTP status code for filtering API GW errors.
 * Set to 400 to capture both 4xx (e.g. 403 from pn-ss) and 5xx errors.
 * Source: Runbook PDF – the default query uses >= 500, but >= 400 is suggested
 * if the output is empty or to include 4xx error patterns.
 */
export const DEFAULT_MIN_STATUS_CODE = 400;
