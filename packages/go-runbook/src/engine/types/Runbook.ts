import type { RunbookExtensions } from './RunbookExtensions.js';
import type { RunbookMetadata } from './RunbookMetadata.js';
import type { StepDescriptor } from './StepDescriptor.js';
import type { KnownCase } from './KnownCase.js';
import type { CaseAction } from './CaseAction.js';
import type { ErrorTreeDefinition } from './ErrorTreeDefinition.js';
import type { ReadPolicy } from './ReadPolicy.js';

/**
 * Complete definition of a runbook.
 * Contains metadata, steps to execute, and known cases for resolution.
 */
export interface Runbook extends RunbookExtensions {
  /** Runbook metadata */
  readonly metadata: RunbookMetadata;
  /** Steps to execute in sequence (unless flow directives redirect) */
  readonly steps: ReadonlyArray<StepDescriptor>;
  /** Known cases to verify at the end of execution */
  readonly knownCases: ReadonlyArray<KnownCase>;
  /** Action to execute if no known case matches */
  readonly fallbackAction: CaseAction;
  /** Maximum number of iterations for anti-loop protection */
  readonly maxIterations?: number;
  /** Levels investigated after the steps of the window, one node per error; absent for a window-level runbook. */
  readonly tree?: ErrorTreeDefinition;
  readonly readPolicy?: ReadPolicy;
}
