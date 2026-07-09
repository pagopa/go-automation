export type BuildInteropK8sApplicationLogsQueryFn = (podApp: string) => string;
export type BuildInteropK8sCidTrackerQueryFn = (cid: string) => string;

export interface InteropK8sQueryProfile {
  readonly id: string;
  readonly applicationLogsQueryProfileId: string;
  readonly cidTrackerQueryProfileId: string;
  readonly buildApplicationLogsQuery: BuildInteropK8sApplicationLogsQueryFn;
  readonly buildCidTrackerQuery: BuildInteropK8sCidTrackerQueryFn;
}
