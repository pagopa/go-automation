import type { AnalysisLinkRef } from './AnalysisLinkRef.js';
import type { AnalysisResourceRef } from './AnalysisResourceRef.js';

/**
 * References shared by every known case of a runbook.
 *
 * They are merged with the per-case declarations when the draft is composed:
 * lists are unioned with de-duplication, scalars come from the primary case.
 */
export interface RunbookAnalysisDefaults {
  /** Documental runbook name; Watchtower uses it only when the alarm has none. */
  readonly runbookName?: string;
  readonly resources?: ReadonlyArray<AnalysisResourceRef>;
  readonly downstreams?: ReadonlyArray<string>;
  readonly finalActions?: ReadonlyArray<string>;
  readonly links?: ReadonlyArray<AnalysisLinkRef>;
}
