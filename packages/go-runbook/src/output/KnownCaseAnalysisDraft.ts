import type { AnalysisLinkRef } from '../types/AnalysisLinkRef.js';
import type { AnalysisResourceRef } from '../types/AnalysisResourceRef.js';

/**
 * Deterministic analysis draft emitted when a known case matched.
 *
 * It carries human-readable names only: Watchtower resolves them to ids inside
 * the apply transaction. `proposedStatus` is a proposal — the apply always
 * persists `IN_PROGRESS` and only a confirmed review promotes it.
 */
export interface KnownCaseAnalysisDraft {
  readonly schemaVersion: 1;
  readonly kind: 'KNOWN_CASE';
  /** Already interpolated (≤5000, aligned with the Watchtower contract). */
  readonly conclusionNotes: string;
  readonly errorDetails?: string;
  readonly proposedStatus: 'IN_PROGRESS' | 'COMPLETED';
  readonly analysisType: 'ANALYZABLE' | 'IGNORABLE';
  readonly ignoreReasonCode?: string;
  readonly ignoreDetails?: Readonly<Record<string, unknown>>;
  readonly runbookName?: string;
  readonly resources: ReadonlyArray<AnalysisResourceRef>;
  readonly downstreams: ReadonlyArray<string>;
  readonly finalActions: ReadonlyArray<string>;
  readonly links: ReadonlyArray<AnalysisLinkRef>;
}
