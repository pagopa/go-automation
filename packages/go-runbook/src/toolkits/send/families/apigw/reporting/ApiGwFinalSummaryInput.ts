import type { GOLogger } from '@pagopa/go-common/logging';
import type { RunbookExecutionStatus } from '../../../../../engine/types/RunbookExecutionStatus.js';

/**
 * Input expected by {@link renderApiGwFinalSummary}.
 *
 * The consumer script collects these fields from the result returned
 * by `RunbookEngine.execute` (the ordered `matchedCases` list and the
 * final context vars) so the closing banner reflects the **actual**
 * outcome of the runbook — not just the local view of the last
 * `decide-<service>` step. `matchedCases` can contain zero, one or
 * many entries (the engine evaluates all known cases but executes only
 * the primary action).
 */
export interface ApiGwFinalSummaryInput {
  /** Logger used to emit the structured banner. */
  readonly logger: GOLogger;
  /** Engine outcome: a run that did not complete has no diagnosis to report. */
  readonly status: RunbookExecutionStatus;
  /** Why the run stopped, when the engine recorded one. */
  readonly failureReason?: string;
  /**
   * IDs of the known cases the engine ultimately matched (either via
   * early resolution or via the post-loop case match), sorted by
   * priority descending (`matchedCaseIds[0]` is the primary). Empty
   * array when no case matched.
   */
  readonly matchedCaseIds: ReadonlyArray<string>;
  /** Read-only snapshot of `finalContext.vars`. */
  readonly vars: ReadonlyMap<string, string>;
}
