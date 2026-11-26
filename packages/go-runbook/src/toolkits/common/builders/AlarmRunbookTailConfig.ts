import type { CaseAction, KnownCase } from '../../../engine/index.js';
import type { RunbookAnalysisDefaults } from '../analysis/RunbookAnalysisDefaults.js';

/**
 * The part of an alarm config every toolkit builder ends by consuming.
 * Declared structurally so each family can pass its own config object.
 */
export interface AlarmRunbookTailConfig {
  readonly id: string;
  readonly knownCases: ReadonlyArray<KnownCase>;
  readonly fallbackAction?: CaseAction;
  readonly analysisDefaults?: RunbookAnalysisDefaults;
  readonly maxIterations?: number;
}
