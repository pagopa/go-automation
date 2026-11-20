import type { CoverageEntry } from '../../../engine/types/CoverageEntry.js';
import type { ObservedErrors } from '../../../engine/types/ObservedErrors.js';
import type { CoverageInterruptionCount } from './CoverageInterruptionCount.js';
import type { CoverageLevelOutput } from './CoverageLevelOutput.js';

/** What the runbook saw and what it could not see. */
export interface RunbookCoverageOutput {
  /** `true` when no source is incomplete. Errors left unexamined do not make the evidence incomplete. */
  readonly complete: boolean;
  /** Incomplete sources, with the step that declared them; details are bounded and scrubbed of profile names. */
  readonly sources: ReadonlyArray<CoverageEntry>;
  /** Errors observed and examined, when a step enumerates the errors of the window. */
  readonly errors?: ObservedErrors;
  /** In an error tree: the nodes of each level, by outcome. */
  readonly levels?: ReadonlyArray<CoverageLevelOutput>;
  /** In an error tree: the interrupted chains, by reason. */
  readonly interruptions?: ReadonlyArray<CoverageInterruptionCount>;
}
