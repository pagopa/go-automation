import type { IdentifierObservation } from '../../../engine/index.js';
import type { AnalysisType } from '../analysis/AnalysisType.js';

export interface KnownErrorDetectionOutput {
  /** The code of the known error, the same in go-runbooks and in Watchtower. */
  readonly code: string;
  readonly description: string;
  /** The analysis type the known error declares, so a reader knows which known error is IGNORABLE. */
  readonly analysisType?: AnalysisType;
  readonly firstSeenAt?: string;
  readonly lastSeenAt?: string;
  readonly evidenceRows: number;
  readonly errors: number;
  readonly resolvedMessage?: string;
  readonly resolvedMessages?: ReadonlyArray<string>;
  readonly observations: ReadonlyArray<IdentifierObservation>;
}
