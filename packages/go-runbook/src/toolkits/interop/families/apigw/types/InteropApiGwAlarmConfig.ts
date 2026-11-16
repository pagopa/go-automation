import type { CaseAction } from '../../../../../engine/types/CaseAction.js';
import type { KnownCase } from '../../../../../engine/types/KnownCase.js';
import type { OccurrenceTimeWindow } from '../../../../common/time/occurrence/OccurrenceTimeWindow.js';
import type { RunbookMetadata } from '../../../../../engine/types/RunbookMetadata.js';
import type { RunbookAnalysisDefaults } from '../../../../common/analysis/RunbookAnalysisDefaults.js';
import type { TimeRangeFromParams } from '../../../../common/time/TimeRangeFromParams.js';
import type { InteropApiGwAccessLogConfig } from './InteropApiGwAccessLogConfig.js';
import type { InteropApiGwApplicationLogConfig } from './InteropApiGwApplicationLogConfig.js';
import type { InteropApiGwQueryProfile } from '../profiles/InteropApiGwQueryProfile.js';
import type { ResolveInteropApiGwAlarmContextFn } from './ResolveInteropApiGwAlarmContextFn.js';
import type { InteropApiGwRunbookStepIds } from './InteropApiGwRunbookStepIds.js';
import type { PipelineHook } from '../../../../../engine/types/PipelineHook.js';
import type { InteropApiGwPipelineAnchor } from './InteropApiGwPipelineAnchor.js';

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
  /** Custom diagnostics collected before CID analysis can resolve the runbook. */
  readonly hooks?: ReadonlyArray<PipelineHook<InteropApiGwPipelineAnchor>>;
}
