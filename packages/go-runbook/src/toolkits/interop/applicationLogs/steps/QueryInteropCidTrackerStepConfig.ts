import type { TimeRangeFromParams } from '../../../common/time/TimeRangeFromParams.js';
import type { BuildInteropK8sCidTrackerQueryFn } from '../types/BuildInteropK8sCidTrackerQueryFn.js';

export interface QueryInteropCidTrackerStepConfig {
  readonly id: string;
  readonly label: string;
  readonly fromStep: string;
  readonly timeRangeFromParams: TimeRangeFromParams;
  readonly logGroupVar?: string;
  readonly varPrefix?: string;
  /** Trace profile id of the query (from the product profile). */
  readonly queryProfileId: string;
  /** Query builder (from the product profile). */
  readonly buildQuery: BuildInteropK8sCidTrackerQueryFn;
}
