import { interop } from '../framework.js';

import { INTEROP_PUBLIC_CATALOG_SERVICE_NAME } from './resolveInteropAlarmContext.js';

const STEP_IDS = interop.k8s.defaultInteropK8sRunbookStepIds(INTEROP_PUBLIC_CATALOG_SERVICE_NAME);

export const RESOLVE_INTEROP_ALARM_CONTEXT_STEP_ID: string = STEP_IDS.resolveContext;
export const QUERY_INTEROP_APPLICATION_LOGS_STEP_ID: string = STEP_IDS.queryApplicationLogs;
export const ANALYZE_INTEROP_APPLICATION_LOGS_STEP_ID: string = STEP_IDS.analyzeApplicationLogs;
export const QUERY_INTEROP_CID_TRACKER_STEP_ID: string = STEP_IDS.queryCidTracker;
export const ANALYZE_INTEROP_CID_TRACKER_STEP_ID: string = STEP_IDS.analyzeCidTracker;
