import type { CaseAction } from '../../../actions/CaseAction.js';
import type { KnownCase } from '../../../types/KnownCase.js';
import type { RunbookMetadata } from '../../../types/RunbookMetadata.js';
import type { RunbookAnalysisDefaults } from '../../../types/RunbookAnalysisDefaults.js';
import type { TimeRangeFromParams } from '../../../steps/data/TimeRangeFromParams.js';
import type { InteropK8sQueryProfile } from '../profiles/InteropK8sQueryProfile.js';
import type { ResolveInteropK8sAlarmContextFn } from './InteropK8sAlarmContext.js';
import type { InteropK8sRunbookStepIds } from './InteropK8sRunbookStepIds.js';
import type { InteropK8sServiceDescriptor } from './InteropK8sServiceDescriptor.js';

/** Configuration accepted by `createInteropK8sAlarmRunbook`. */
export interface InteropK8sAlarmConfig {
  readonly id: string;
  readonly metadata: Omit<RunbookMetadata, 'id'>;
  readonly service: InteropK8sServiceDescriptor;
  readonly resolveAlarmContext: ResolveInteropK8sAlarmContextFn;
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
  readonly maxIterations?: number;
}
