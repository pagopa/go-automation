/**
 * Contract with Watchtower: entrypoint `@pagopa/go-runbook/output`
 * (EVO-RBREORG-OPUS-01 §8.1, R1).
 *
 * Output of an execution, outcome and check, output context and evidence,
 * telemetry, analysis annotations and the analysis draft (D11). Types only,
 * plus the pure functions that classify an outcome and build a draft.
 *
 * @example
 * ```typescript
 * import { classifyRunbookOutcome, type RunbookOutput } from '@pagopa/go-runbook/output';
 * ```
 */

export type { RunbookOutput } from './RunbookOutput.js';
export type { ClassifiedRunbookCheck, RunbookCheck, RunbookCheckStatus } from './RunbookCheck.js';
export { classifyRunbookOutcome, noRunbookCheck } from './classifyRunbookOutcome.js';
export type {
  RunbookOutcome,
  KnownCaseMatchedOutcome,
  UnknownCaseOutcome,
  ProcedureSuccessOutcome,
  ProcedureFailureOutcome,
  FailedOutcome,
  AbortedOutcome,
} from './RunbookOutcome.js';
export type { RunbookOutputContext, RunbookResultField, RunbookEvidence } from './RunbookOutputContext.js';
export { emptyRunbookOutputContext } from './RunbookOutputContext.js';
export type {
  RunbookTelemetry,
  CloudWatchLogsTelemetry,
  CloudWatchLogsTelemetryQueryExecution,
} from '../telemetry/RunbookTelemetry.js';
export type { KnownCaseAnalysis } from '../analysis/KnownCaseAnalysis.js';
export type { AnalysisResourceRef } from '../analysis/AnalysisResourceRef.js';
export type { AnalysisLinkRef } from '../analysis/AnalysisLinkRef.js';
export { buildAnalysisDraft } from '../analysis/draft/buildAnalysisDraft.js';
export { ANALYSIS_DRAFT_BOUNDS } from '../analysis/draft/analysisDraftBounds.js';
export type { AnalysisDraftV1 } from '../analysis/draft/AnalysisDraft.js';
export type { KnownCaseAnalysisDraft } from '../analysis/draft/KnownCaseAnalysisDraft.js';
export type { UnknownCaseContextDraft } from '../analysis/draft/UnknownCaseContextDraft.js';

// Operational model augmentations: keeps the operational fields in a consumer's program (EVO-RBREORG-OPUS-01 RBREORG-11).
export type { OperationalModelAugmentations } from '../augmentations/index.js';
