import type { AnalysisLinkRef } from '../types/AnalysisLinkRef.js';
import type { AnalysisResourceRef } from '../types/AnalysisResourceRef.js';

/**
 * Context emitted when no known case matched: the defaults references only, with
 * no semantic directive.
 *
 * An unknown case never materializes an analysis in v1; Watchtower evaluates this
 * draft solely as a readiness signal (`contextValidationStatus`).
 */
export interface UnknownCaseContextDraft {
  readonly schemaVersion: 1;
  readonly kind: 'UNKNOWN_CASE_CONTEXT';
  readonly runbookName?: string;
  readonly resources: ReadonlyArray<AnalysisResourceRef>;
  readonly downstreams: ReadonlyArray<string>;
  readonly finalActions: ReadonlyArray<string>;
  readonly links: ReadonlyArray<AnalysisLinkRef>;
}
