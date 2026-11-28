import type { AnalysisType } from '../analysis/AnalysisType.js';

/**
 * A known error of a runbook as the catalog publishes it: what Watchtower needs to create its known error with the
 * same code. Resolution and analysis type are absent when the runbook does not
 * declare the analysis of the known error.
 */
export interface KnownErrorDescriptor {
  readonly code: string;
  readonly title: string;
  readonly description: string;
  readonly resolution?: string;
  readonly analysisType?: AnalysisType;
}
