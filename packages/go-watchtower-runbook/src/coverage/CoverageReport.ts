import type { CoverageIssue } from './CoverageIssue.js';

/**
 * Data-only outcome of the coverage check.
 *
 * Rendering and exit codes belong to the CLI: `errors` empty means the declared
 * references would all resolve at apply time.
 */
export interface CoverageReport {
  readonly checkedRunbooks: number;
  readonly checkedKnownCases: number;
  /** Declared references compared against the census, across every runbook. */
  readonly checkedReferences: number;
  readonly errors: ReadonlyArray<CoverageIssue>;
  readonly warnings: ReadonlyArray<CoverageIssue>;
}
