/**
 * Contract with Watchtower: entrypoint `@pagopa/go-runbook/output`.
 *
 * Output of an execution, outcome and check, output context and evidence,
 * telemetry, analysis annotations and the analysis draft. Types only,
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
export type { ErrorChainSummary } from './ErrorChainSummary.js';
export type { ErrorChainNode } from './ErrorChainNode.js';
export type { ErrorChainInterruption } from './ErrorChainInterruption.js';
export type { ErrorChainMember } from './ErrorChainMember.js';
export type { ErrorChainRoute } from './ErrorChainRoute.js';
export type { ErrorChainSample } from './ErrorChainSample.js';
export type { CoverageLevelOutput } from './CoverageLevelOutput.js';
export type { CoverageInterruptionCount } from './CoverageInterruptionCount.js';
export type {
  CoverageEntry,
  CoverageReason,
  ErrorChainInterruptionReason,
  IdentifierObservation,
  ObservedErrors,
} from '../../../engine/index.js';
export type { RunbookCoverageOutput } from './RunbookCoverageOutput.js';
export { buildCoverageLines } from './buildCoverageLines.js';
export { buildRunbookTelemetry } from '../telemetry/buildRunbookTelemetry.js';
export { renderErrorChainLines, renderErrorChainTree } from './renderErrorChainLines.js';
export type { ErrorChainTreeOptions } from './ErrorChainTreeOptions.js';
export { buildErrorChains } from './buildErrorChains.js';
export type { RunbookCheck } from './RunbookCheck.js';
export type { ClassifiedRunbookCheck } from './ClassifiedRunbookCheck.js';
export type { RunbookCheckStatus } from './RunbookCheckStatus.js';
export { classifyRunbookOutcome, noRunbookCheck } from './classifyRunbookOutcome.js';
export type { RunbookOutcome } from './RunbookOutcome.js';
export type { KnownCaseMatchedOutcome } from './KnownCaseMatchedOutcome.js';
export type { KnownCaseDetectionOutput } from './KnownCaseDetectionOutput.js';
export type { UnknownCaseOutcome } from './UnknownCaseOutcome.js';
export type { InconclusiveOutcome } from './InconclusiveOutcome.js';
export type { ProcedureSuccessOutcome } from './ProcedureSuccessOutcome.js';
export type { ProcedureFailureOutcome } from './ProcedureFailureOutcome.js';
export type { FailedOutcome } from './FailedOutcome.js';
export type { AbortedOutcome } from './AbortedOutcome.js';
export type { RunbookOutputContext } from './RunbookOutputContext.js';
export type { RunbookResultField } from './RunbookResultField.js';
export type { RunbookEvidence } from './RunbookEvidence.js';
export { emptyRunbookOutputContext } from './RunbookOutputContext.js';
export type { RunbookTelemetry } from '../telemetry/RunbookTelemetry.js';
export type { CloudWatchLogsTelemetry } from '../telemetry/CloudWatchLogsTelemetry.js';
export type { CloudWatchLogsTelemetryQueryExecution } from '../telemetry/CloudWatchLogsTelemetryQueryExecution.js';
export type { KnownCaseAnalysis } from '../analysis/KnownCaseAnalysis.js';
export type { AnalysisType } from '../analysis/AnalysisType.js';
export type { ProposedAnalysisStatus } from '../analysis/ProposedAnalysisStatus.js';
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
