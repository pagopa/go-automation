/** Default time window in minutes (±N from alarm time) */
export const DEFAULT_TIME_WINDOW_MINUTES = 5;

/** API Gateway REST API id shared by the delivery public API alarms. */
export const DELIVERY_API_GW_REST_API_ID = '64pohg7bg0';

/** API Gateway stage name used by the delivery public API execution logs. */
export const DELIVERY_API_GW_STAGE_NAME = 'unique';

/**
 * API Gateway execution log group shared by the delivery public API alarms.
 *
 * Format: `API-Gateway-Execution-Logs_<restApiId>/<stageName>`.
 * Keep this aligned with the deployed API Gateway RestApiId and stage.
 */
export const DELIVERY_API_GW_EXECUTION_LOG_GROUP: string = `API-Gateway-Execution-Logs_${DELIVERY_API_GW_REST_API_ID}/${DELIVERY_API_GW_STAGE_NAME}`;
