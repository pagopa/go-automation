import type { RunbookMetadata } from './RunbookMetadata.js';
import type { StepDescriptor } from './StepDescriptor.js';
import type { KnownCase } from './KnownCase.js';
import type { CaseAction } from '../actions/CaseAction.js';
import type { CloudExecutionPolicy } from './CloudExecutionPolicy.js';
import type { RunbookAnalysisDefaults } from './RunbookAnalysisDefaults.js';
import type { OccurrenceTimeWindow } from './OccurrenceTimeWindow.js';

/**
 * Complete definition of a runbook.
 * Contains metadata, steps to execute, and known cases for resolution.
 */
export interface Runbook {
  /** Runbook metadata */
  readonly metadata: RunbookMetadata;
  /** Steps to execute in sequence (unless flow directives redirect) */
  readonly steps: ReadonlyArray<StepDescriptor>;
  /** Known cases to verify at the end of execution */
  readonly knownCases: ReadonlyArray<KnownCase>;
  /** Action to execute if no known case matches */
  readonly fallbackAction: CaseAction;
  /**
   * Diagnostic window around the alarm occurrence. When omitted, executors
   * apply the catalog default.
   */
  readonly occurrenceTimeWindow?: OccurrenceTimeWindow;
  /** Maximum number of iterations for anti-loop protection */
  readonly maxIterations?: number;
  /** Explicit constraints for execution by a managed cloud worker. */
  readonly cloudExecutionPolicy?: CloudExecutionPolicy;
  /**
   * References shared by every known case when composing the analysis draft.
   *
   * Declaring it marks the runbook as annotated: `validateForCloud` then requires
   * `analysis` on each of its known cases.
   */
  readonly analysisDefaults?: RunbookAnalysisDefaults;
  /**
   * Structured context exposed by runbook builders for downstream
   * consumers such as output builders. The shape is family-specific and
   * must be read through public type guards.
   */
  readonly runbookContext?: unknown;
}
