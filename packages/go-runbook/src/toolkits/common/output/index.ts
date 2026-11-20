/**
 * Contract with Watchtower: entrypoint `@pagopa/go-runbook/output`.
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
export { RUNBOOK_OUTPUT_SCHEMA_VERSION } from './RUNBOOK_OUTPUT_SCHEMA_VERSION.js';
export type { ErrorChainGroup } from './ErrorChainGroup.js';
export type { ErrorChainNode } from './ErrorChainNode.js';
export type { ErrorChainInterruption } from './ErrorChainInterruption.js';
export type { ErrorChainMember } from './ErrorChainMember.js';
export type { ErrorChainRoute } from './ErrorChainRoute.js';
export type { ErrorChainSample } from './ErrorChainSample.js';
export type { CoverageLevelOutput } from './CoverageLevelOutput.js';
export type { CoverageInterruptionCount } from './CoverageInterruptionCount.js';
export type { ErrorChainInterruptionReason } from '../../../engine/types/ErrorChainInterruptionReason.js';
export type { CoverageReason } from '../../../engine/types/CoverageReason.js';
export type { RunbookCoverageOutput } from './RunbookCoverageOutput.js';
export { buildCoverageLines } from './buildCoverageLines.js';
export { renderErrorChainLines } from './renderErrorChainLines.js';
export { buildErrorChains } from './buildErrorChains.js';
export type { CoverageEntry } from '../../../engine/types/CoverageEntry.js';
export type { ObservedErrors } from '../../../engine/types/ObservedErrors.js';
export type { IdentifierObservation } from '../../../engine/types/IdentifierObservation.js';
export type { ClassifiedRunbookCheck, RunbookCheck, RunbookCheckStatus } from './RunbookCheck.js';
export { classifyRunbookOutcome, noRunbookCheck } from './classifyRunbookOutcome.js';
export type {
  RunbookOutcome,
  KnownCaseMatchedOutcome,
  UnknownCaseOutcome,
  InconclusiveOutcome,
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
export { fitAnalysisDraft } from '../analysis/draft/fitAnalysisDraft.js';
export type { AnalysisDraftLimits } from '../analysis/draft/AnalysisDraftLimits.js';
export type { AnalysisDraftParts } from '../analysis/draft/AnalysisDraftParts.js';
export type { AnalysisDraftV1 } from '../analysis/draft/AnalysisDraft.js';
export type { KnownCaseAnalysisDraft } from '../analysis/draft/KnownCaseAnalysisDraft.js';
export type { UnknownCaseContextDraft } from '../analysis/draft/UnknownCaseContextDraft.js';

// Operational model augmentations: keeps the operational fields in a consumer's program.
export type { OperationalModelAugmentations } from '../augmentations/index.js';
