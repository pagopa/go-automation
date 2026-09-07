import type { CaseAction } from '../../../actions/CaseAction.js';
import type { KnownCase } from '../../../types/KnownCase.js';
import type { OccurrenceTimeWindow } from '../../../types/OccurrenceTimeWindow.js';
import type { RunbookMetadata } from '../../../types/RunbookMetadata.js';
import type { RunbookAnalysisDefaults } from '../../../types/RunbookAnalysisDefaults.js';
import type { TimeRangeFromParams } from '../../../steps/data/TimeRangeFromParams.js';
import type { InteropApiGwAccessLogConfig } from './InteropApiGwAccessLogConfig.js';
import type { InteropApiGwApplicationLogConfig } from './InteropApiGwApplicationLogConfig.js';
import type { InteropApiGwQueryProfile } from '../profiles/InteropApiGwQueryProfile.js';
import type { ResolveInteropApiGwAlarmContextFn } from './InteropApiGwAlarmContext.js';
import type { InteropApiGwRunbookStepIds } from './InteropApiGwRunbookStepIds.js';

/** Configuration accepted by `createInteropApiGwAlarmRunbook`. */
export interface InteropApiGwAlarmConfig {
  readonly id: string;
  readonly metadata: Omit<RunbookMetadata, 'id'>;
  /** Identifies the resolver in the trace. */
  readonly resolverId: string;
  readonly resolveAlarmContext: ResolveInteropApiGwAlarmContextFn;
  /** The two queries the pipeline runs. */
  readonly queryProfile: InteropApiGwQueryProfile;
  readonly apiGw: InteropApiGwAccessLogConfig;
  readonly application: InteropApiGwApplicationLogConfig;
  readonly knownCases: ReadonlyArray<KnownCase>;
  /** Time range shared by the API Gateway and CID tracker queries. */
  readonly timeRangeFromParams?: TimeRangeFromParams;
  readonly occurrenceTimeWindow?: OccurrenceTimeWindow;
  readonly analysisDefaults?: RunbookAnalysisDefaults;
  readonly fallbackAction?: CaseAction;
  readonly stepIds?: Partial<InteropApiGwRunbookStepIds>;
  readonly maxIterations?: number;
}
