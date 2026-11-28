import type { Condition, LogActionLevel, LogActionRow } from '../../../../../engine/index.js';
import type { AnalysisLinkRef } from '../../../../common/analysis/AnalysisLinkRef.js';
import type { InteropDownstream } from '../../../analysis/INTEROP_DOWNSTREAMS.js';
import type { InteropEnvironment } from '../../../environment/InteropEnvironment.js';
import type { InteropK8sKnownErrorEvidence } from './InteropK8sKnownErrorEvidence.js';
import type { AnalysisType } from '../../../../common/analysis/AnalysisType.js';
import type { ProposedAnalysisStatus } from '../../../../common/analysis/ProposedAnalysisStatus.js';

/** Declarative known error: a regex on the evidence of the runbook, or a condition of its own. */
export interface InteropK8sKnownErrorConfig {
  readonly code: string;
  readonly description: string;
  readonly title?: string;
  readonly level?: LogActionLevel;
  readonly supersedes?: ReadonlyArray<string>;
  readonly regex?: string;
  readonly evidence?: InteropK8sKnownErrorEvidence;
  readonly condition?: Condition;
  readonly environments?: ReadonlyArray<InteropEnvironment>;
  readonly resolution: string;
  readonly details?: ReadonlyArray<LogActionRow>;
  readonly extraDetails?: ReadonlyArray<LogActionRow>;
  /** Proposed state: the apply persists IN_PROGRESS, a CONFIRMED review promotes it. */
  readonly proposedStatus: ProposedAnalysisStatus;
  readonly analysisType: AnalysisType;
  readonly ignoreReasonCode?: string;
  readonly errorDetails?: string;
  /** Declared only through `INTEROP_DOWNSTREAMS`, never as raw strings. */
  readonly downstreams?: ReadonlyArray<InteropDownstream>;
  readonly finalActions?: ReadonlyArray<string>;
  readonly links?: ReadonlyArray<AnalysisLinkRef>;
}
