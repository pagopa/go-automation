/** Default time window in minutes (±N from alarm time) */
export const DEFAULT_TIME_WINDOW_MINUTES = 5;

/**
 * API Gateway execution log group shared by the delivery public API alarms.
 *
 * Format: `API-Gateway-Execution-Logs_<restApiId>/<stageName>`.
 * Keep this aligned with the deployed API Gateway RestApiId and stage.
 */
export const DELIVERY_API_GW_EXECUTION_LOG_GROUP: string = `API-Gateway-Execution-Logs_64pohg7bg0/unique`;
