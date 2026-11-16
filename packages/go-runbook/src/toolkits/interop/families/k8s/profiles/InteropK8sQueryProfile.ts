import type { BuildInteropK8sApplicationLogsQueryFn } from '../../../applicationLogs/types/BuildInteropK8sApplicationLogsQueryFn.js';
import type { BuildInteropK8sCidTrackerQueryFn } from '../../../applicationLogs/types/BuildInteropK8sCidTrackerQueryFn.js';

export interface InteropK8sQueryProfile {
  readonly id: string;
  readonly applicationLogsQueryProfileId: string;
  readonly cidTrackerQueryProfileId: string;
  readonly buildApplicationLogsQuery: BuildInteropK8sApplicationLogsQueryFn;
  readonly buildCidTrackerQuery: BuildInteropK8sCidTrackerQueryFn;
}
