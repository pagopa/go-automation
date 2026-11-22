import type { TimeRangeFromParams } from '../../../../common/time/TimeRangeFromParams.js';
import type { BuildInteropApiGwAggregateQueryFn } from './BuildInteropApiGwAggregateQueryFn.js';

export interface QueryInteropApiGwAggregatesStepConfig {
  readonly id: string;
  readonly label: string;
  readonly timeRangeFromParams: TimeRangeFromParams;
  readonly queryProfileId: string;
  readonly queryKind: string;
  readonly errorFamilyLabel: string;
  readonly buildQuery: BuildInteropApiGwAggregateQueryFn;
  readonly apiGwIdVar?: string;
  readonly logGroupVar?: string;
}
