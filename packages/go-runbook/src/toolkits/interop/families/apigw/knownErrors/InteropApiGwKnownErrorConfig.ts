import type { Condition } from '../../../../../engine/index.js';
import type { AnalysisLinkRef } from '../../../../common/analysis/AnalysisLinkRef.js';
import type { InteropDownstream } from '../../../analysis/INTEROP_DOWNSTREAMS.js';
import type { InteropEnvironment } from '../../../environment/InteropEnvironment.js';
import type { InteropApiGwKnownErrorEvidence } from './InteropApiGwKnownErrorEvidence.js';
import type { ProposedAnalysisStatus } from '../../../../common/analysis/ProposedAnalysisStatus.js';

export interface InteropApiGwKnownErrorConfig {
  readonly code: string;
  readonly description: string;
  readonly regex: string;
  readonly resolution: string;
  readonly proposedStatus: ProposedAnalysisStatus;
  readonly evidence?: InteropApiGwKnownErrorEvidence;
  readonly environments?: ReadonlyArray<InteropEnvironment>;
  readonly downstreams?: ReadonlyArray<InteropDownstream>;
  readonly resources?: ReadonlyArray<string>;
  readonly finalActions?: ReadonlyArray<string>;
  readonly links?: ReadonlyArray<AnalysisLinkRef>;
  readonly excludeRegex?: string;
  readonly guard?: Condition;
}
