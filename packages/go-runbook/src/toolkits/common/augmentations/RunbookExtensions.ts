import type { RunbookAnalysisDefaults } from '../analysis/RunbookAnalysisDefaults.js';
import type { AlarmRunbookContext } from '../output/AlarmRunbookContext.js';
import type { RunbookOutputDefinition } from '../output/RunbookOutputDefinition.js';
import type { CloudExecutionPolicy } from '../policies/CloudExecutionPolicy.js';
import type { OccurrenceTimeWindow } from '../time/occurrence/OccurrenceTimeWindow.js';

declare module '../../../engine/types/RunbookExtensions.js' {
  /** Operational fields of a runbook, written by {@link AlarmRunbookBuilder}. */
  interface RunbookExtensions {
    /** Diagnostic padding around the alarm occurrence. */
    readonly occurrenceTimeWindow?: OccurrenceTimeWindow;
    /** Constraints for the cloud worker. */
    readonly cloudExecutionPolicy?: CloudExecutionPolicy;
    /** Analysis references shared by every known case. */
    readonly analysisDefaults?: RunbookAnalysisDefaults;
    /** Structured, family-specific context read by the output builders. */
    readonly runbookContext?: AlarmRunbookContext;
    /** Explicit scalar diagnostics and source metadata; step evidence lives on StepDescriptor. */
    readonly output?: RunbookOutputDefinition;
  }
}

/** Marker that loads the operational fields of `Runbook`. */
export type RunbookExtensionsAugmentation = 'runbook';
