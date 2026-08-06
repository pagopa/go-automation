import type { AnalysisLinkRef } from './AnalysisLinkRef.js';
import type { AnalysisResourceRef } from './AnalysisResourceRef.js';

/**
 * Analysis directives declared by a known case.
 *
 * Only what the runbook actually knows is declared: resources, downstreams and
 * final actions stay omitted rather than being invented for formal completeness.
 * A declared reference that does not resolve in the census blocks the apply.
 */
export interface KnownCaseAnalysis {
  /** Resolution text interpolated into `conclusionNotes`; placeholders allowed. */
  readonly resolution: string;
  /** Proposed state: the apply persists IN_PROGRESS, a CONFIRMED review promotes it. */
  readonly proposedStatus: 'IN_PROGRESS' | 'COMPLETED';
  readonly analysisType: 'ANALYZABLE' | 'IGNORABLE';
  /** Required when `analysisType` is IGNORABLE. */
  readonly ignoreReasonCode?: string;
  /** Validated against the Watchtower `IgnoreReason.detailsSchema`. */
  readonly ignoreDetails?: Readonly<Record<string, unknown>>;
  readonly errorDetails?: string;
  readonly resources?: ReadonlyArray<AnalysisResourceRef>;
  /** Declared only through the per-product catalogs, never as raw strings. */
  readonly downstreams?: ReadonlyArray<string>;
  readonly finalActions?: ReadonlyArray<string>;
  readonly links?: ReadonlyArray<AnalysisLinkRef>;
}
