import type { OccurrenceTimeWindow } from '../../types/OccurrenceTimeWindow.js';

/** Default symmetric time-window padding retained for compatibility. */
export const DEFAULT_TIME_WINDOW_MINUTES = 5;

/** Default diagnostic window used by runbooks that do not override it. */
export const DEFAULT_OCCURRENCE_TIME_WINDOW: OccurrenceTimeWindow = {
  beforeMinutes: DEFAULT_TIME_WINDOW_MINUTES,
  afterMinutes: DEFAULT_TIME_WINDOW_MINUTES,
};

/**
 * API Gateway execution log group shared by the delivery public API alarms.
 *
 * Format: `API-Gateway-Execution-Logs_<restApiId>/<stageName>`.
 * Keep this aligned with the deployed API Gateway RestApiId and stage.
 */
export const DELIVERY_API_GW_EXECUTION_LOG_GROUP: string = `API-Gateway-Execution-Logs_64pohg7bg0/unique`;
