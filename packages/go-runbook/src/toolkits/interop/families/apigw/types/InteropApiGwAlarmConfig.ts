import type { CaseAction, KnownError, PipelineHook, RunbookMetadata } from '../../../../../engine/index.js';
import type { OccurrenceTimeWindow } from '../../../../common/time/occurrence/OccurrenceTimeWindow.js';
import type { RunbookAnalysisDefaults } from '../../../../common/analysis/RunbookAnalysisDefaults.js';
import type { TimeRangeFromParams } from '../../../../common/time/TimeRangeFromParams.js';
import type { InteropApiGwAlarm } from './InteropApiGwAlarm.js';
import type { InteropApiGwApplicationLogConfig } from './InteropApiGwApplicationLogConfig.js';
import type { InteropApiGwQueryProfile } from '../profiles/InteropApiGwQueryProfile.js';
import type { InteropApiGwRunbookStepIds } from './InteropApiGwRunbookStepIds.js';
import type { InteropApiGwPipelineAnchor } from './InteropApiGwPipelineAnchor.js';

/** Configuration accepted by `createInteropApiGwAlarmRunbook`. */
export interface InteropApiGwAlarmConfig {
  /** The alarm: runbook key, service, log groups, profile and context resolution. */
  readonly alarm: InteropApiGwAlarm;
  readonly metadata: Omit<RunbookMetadata, 'id'>;
  /** Identifies the resolver in the trace. */
  readonly resolverId: string;
  /** The two queries the pipeline runs. */
  readonly queryProfile: InteropApiGwQueryProfile;
  readonly application?: InteropApiGwApplicationLogConfig;
  readonly knownErrors: ReadonlyArray<KnownError>;
  /** Time range shared by the API Gateway and CID tracker queries. */
  readonly timeRangeFromParams?: TimeRangeFromParams;
  readonly occurrenceTimeWindow?: OccurrenceTimeWindow;
  readonly analysisDefaults?: RunbookAnalysisDefaults;
  readonly fallbackAction?: CaseAction;
  readonly stepIds?: Partial<InteropApiGwRunbookStepIds>;
  readonly maxIterations?: number;
  /** Custom diagnostics collected before CID analysis can resolve the runbook. */
  readonly hooks?: ReadonlyArray<PipelineHook<InteropApiGwPipelineAnchor>>;
}
