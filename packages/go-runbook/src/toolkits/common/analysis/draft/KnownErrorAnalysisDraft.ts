import type { AnalysisLinkRef } from '../AnalysisLinkRef.js';
import type { AnalysisResourceRef } from '../AnalysisResourceRef.js';
import type { AnalysisType } from '../AnalysisType.js';
import type { ProposedAnalysisStatus } from '../ProposedAnalysisStatus.js';

/**
 * Deterministic analysis draft emitted when a known error matched.
 *
 * It carries human-readable names only: Watchtower resolves them to ids inside
 * the apply transaction. `proposedStatus` is a proposal — the apply always
 * persists `IN_PROGRESS` and only a confirmed review promotes it.
 */
export interface KnownErrorAnalysisDraft {
  readonly schemaVersion: 1;
  readonly kind: 'KNOWN_CASE';
  /** Already interpolated (≤5000, aligned with the Watchtower contract). */
  readonly conclusionNotes: string;
  readonly errorDetails?: string;
  readonly proposedStatus: ProposedAnalysisStatus;
  readonly analysisType: AnalysisType;
  readonly ignoreReasonCode?: string;
  readonly ignoreDetails?: Readonly<Record<string, unknown>>;
  readonly runbookName?: string;
  readonly resources: ReadonlyArray<AnalysisResourceRef>;
  readonly downstreams: ReadonlyArray<string>;
  readonly finalActions: ReadonlyArray<string>;
  readonly links: ReadonlyArray<AnalysisLinkRef>;
}
