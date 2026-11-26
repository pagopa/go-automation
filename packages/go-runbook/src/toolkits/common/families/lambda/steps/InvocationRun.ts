import type { TimeRange } from '../../../time/TimeRange.js';

/** Time range and split queries used so far, shared by all the sources of one execution. */
export interface InvocationRun {
  readonly timeRange: TimeRange;
  splits: number;
}
