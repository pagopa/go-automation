/**
 * Constants for the pn-address-book-io-IO-ApiGwAlarm runbook.
 */

/** API Gateway AccessLog log group for pn-user-attributes */
export const API_GW_LOG_GROUP =
  'pn-user-attributes-microsvc-prod-AddressBookMicroservicePublicIoAPI-1C6CG6ZRGH1WD-PublicApiLogGroup-bYfVwP3QLlF0';

/** ECS log group for pn-user-attributes */
export const USER_ATTRIBUTES_LOG_GROUP = '/aws/ecs/pn-user-attributes';

/** ECS log group for pn-data-vault */
export const DATA_VAULT_LOG_GROUP = '/aws/ecs/pn-data-vault';

/** ECS log group for pn-external-registries */
export const EXTERNAL_REGISTRIES_LOG_GROUP = '/aws/ecs/pn-external-registries';

/** Lambda log group for pn-ioAuthorizerLambda */
export const IO_AUTHORIZER_LAMBDA_LOG_GROUP = '/aws/lambda/pn-ioAuthorizerLambda';

/** Default time window in minutes (±N from alarm time) */
export const DEFAULT_TIME_WINDOW_MINUTES = 5;

/**
 * Default minimum HTTP status code for filtering API GW errors.
 * Set to 400 to capture both 4xx and 5xx errors from the known cases table.
 */
export const DEFAULT_MIN_STATUS_CODE = 400;
