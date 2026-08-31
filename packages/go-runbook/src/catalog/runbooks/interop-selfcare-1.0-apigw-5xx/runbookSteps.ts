import { INTEROP_SELFCARE_API_GW_SERVICE_NAME } from './resolveInteropAlarmContext.js';

export const RESOLVE_INTEROP_SELFCARE_API_GW_CONTEXT_STEP_ID = 'resolve-interop-selfcare-api-gw-context';
export const QUERY_INTEROP_API_GW_5XX_STEP_ID = 'query-api-gw-logs';
export const ANALYZE_INTEROP_API_GW_5XX_STEP_ID = 'analyze-api-gw-logs';
export const QUERY_INTEROP_APPLICATION_LOGS_STEP_ID: string = `query-${INTEROP_SELFCARE_API_GW_SERVICE_NAME}`;
export const ANALYZE_INTEROP_APPLICATION_LOGS_STEP_ID: string = `analyze-${INTEROP_SELFCARE_API_GW_SERVICE_NAME}`;
export const QUERY_INTEROP_CID_TRACKER_STEP_ID = 'query-interop-cid-tracker';
export const ANALYZE_INTEROP_CID_TRACKER_STEP_ID = 'analyze-interop-cid-tracker';
