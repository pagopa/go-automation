import type { ValidationIssue } from './ValidationIssue.js';

/**
 * Invalid outcome of `buildRecord`: the row is `INVALID`.
 */
export interface RecordBuildFailure {
  readonly ok: false;
  readonly issues: ReadonlyArray<ValidationIssue>;
}
