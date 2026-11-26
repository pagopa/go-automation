import type { CaseAction, KnownCase, PipelineHook, RunbookMetadata } from '../../../../../engine/index.js';
import type { OccurrenceTimeWindow } from '../../../../common/time/occurrence/OccurrenceTimeWindow.js';
import type { AnalysisResourceRef } from '../../../../common/analysis/AnalysisResourceRef.js';
import type { RunbookAnalysisDefaults } from '../../../../common/analysis/RunbookAnalysisDefaults.js';
import type { TimeRangeFromParams } from '../../../../common/time/TimeRangeFromParams.js';
import type { InteropK8sQueryProfile } from '../profiles/InteropK8sQueryProfile.js';
import type { InteropK8sAlarm } from './InteropK8sAlarm.js';
import type { InteropK8sPodContext } from './InteropK8sPodContext.js';
import type { InteropK8sRunbookStepIds } from './InteropK8sRunbookStepIds.js';
import type { InteropK8sPipelineAnchor } from './InteropK8sPipelineAnchor.js';

/** Configuration accepted by `createInteropK8sAlarmRunbook`. */
export interface InteropK8sAlarmConfig {
  /** The alarm: runbook key, pod app, log group, var prefix and context resolution. */
  readonly alarm: InteropK8sAlarm;
  readonly metadata: Omit<RunbookMetadata, 'id'>;
  readonly knownCases: ReadonlyArray<KnownCase>;
  /**
   * Analysis references shared by the known cases. The builder always prepends the
   * service as `PRIMARY` resource, so only the extra references go here.
   */
  readonly analysisDefaults?: RunbookAnalysisDefaults;
  readonly fallbackAction?: CaseAction;
  readonly queryProfile?: InteropK8sQueryProfile;
  readonly stepIds?: Partial<InteropK8sRunbookStepIds>;
  readonly timeRangeFromParams?: TimeRangeFromParams;
  readonly occurrenceTimeWindow?: OccurrenceTimeWindow;
  readonly maxIterations?: number;
  /** Custom diagnostic steps collected before CID analysis can resolve the runbook. */
  readonly hooks?: ReadonlyArray<PipelineHook<InteropK8sPipelineAnchor>>;
  readonly podContext?: InteropK8sPodContext;
  readonly primaryResource?: Omit<AnalysisResourceRef, 'role'>;
}
