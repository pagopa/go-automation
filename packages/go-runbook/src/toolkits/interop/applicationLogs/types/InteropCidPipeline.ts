import type { PipelineHook } from '../../../../engine/index.js';
import type { TimeRangeFromParams } from '../../../common/time/TimeRangeFromParams.js';
import type { BuildInteropK8sApplicationLogsQueryFn } from './BuildInteropK8sApplicationLogsQueryFn.js';
import type { BuildInteropK8sCidTrackerQueryFn } from './BuildInteropK8sCidTrackerQueryFn.js';

/** The tail every INTEROP alarm pipeline shares: application logs, their CIDs, the CID tracker. */
export interface InteropCidPipeline {
  readonly stepIds: {
    readonly queryApplicationLogs: string;
    readonly analyzeApplicationLogs: string;
    readonly queryCidTracker: string;
    readonly analyzeCidTracker: string;
  };
  readonly applicationLabel: string;
  readonly applicationTimeRange: TimeRangeFromParams;
  readonly applicationLogsQueryProfileId: string;
  readonly buildApplicationLogsQuery: BuildInteropK8sApplicationLogsQueryFn;
  readonly varPrefix: string;
  readonly countField?: string;
  readonly cidTrackerTimeRange: TimeRangeFromParams;
  readonly cidTrackerQueryProfileId: string;
  readonly buildCidTrackerQuery: BuildInteropK8sCidTrackerQueryFn;
  readonly hooks: ReadonlyArray<PipelineHook<'before-cid-analysis'>>;
  readonly reachedAnchors: Set<'before-cid-analysis'>;
}
