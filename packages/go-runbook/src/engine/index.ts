/**
 * Barrel of the runbook engine: the content of the public entrypoint `.`
 * (`@pagopa/go-runbook`, re-exported by `src/index.ts`).
 *
 * Toolkits and runbooks import the engine only from here. The engine knows no
 * AWS, product, alarm or Watchtower.
 */

export type { ActionExecutionResult } from './actions/ActionExecutor.js';
export { ActionExecutor } from './actions/ActionExecutor.js';
export { compositeAction, escalateAction, logAction, notifyAction } from './actions/ActionFactories.js';
export type {
  CaseAction,
  CaseActionType,
  CompositeAction,
  EscalateAction,
  LogAction,
  NotifyAction,
  UpdateAction,
} from './types/CaseAction.js';
export { RunbookBuilder } from './builders/RunbookBuilder.js';
export {
  addLogEntry,
  addRecoveredError,
  createInitialContext,
  mergeChildContext,
  updateContextWithStepResult,
} from './context/RunbookContextHelper.js';
export { ConditionEvaluator } from './core/ConditionEvaluator.js';
export { RunbookEngine } from './core/RunbookEngine.js';
export { interpolatePlaceholders } from './context/templatePlaceholders.js';
export { throwIfRunbookAborted } from './context/throwIfRunbookAborted.js';
export { all, any, not } from './conditions/conditions.js';
export { anyStepEvidenceMatches, stepEvidenceMatches } from './conditions/evidenceConditions.js';
export { varEquals, varExists, varMatches } from './conditions/varConditions.js';
export { RunbookMaxIterationsError } from './errors/RunbookMaxIterationsError.js';
export { CollectingRunbookReporter } from './reporting/CollectingRunbookReporter.js';
export { ConsoleRunbookReporter } from './reporting/ConsoleRunbookReporter.js';
export { NOOP_RUNBOOK_REPORTER } from './reporting/NOOP_RUNBOOK_REPORTER.js';
export type { RunbookReporter } from './reporting/RunbookReporter.js';
export type { AssertStepConfig } from './steps/check/AssertStep.js';
export { AssertStep } from './steps/check/AssertStep.js';
export type { CompareStepConfig } from './steps/check/CompareStep.js';
export { CompareStep } from './steps/check/CompareStep.js';
export type { ExistsStepConfig } from './steps/check/ExistsStep.js';
export { ExistsStep } from './steps/check/ExistsStep.js';
export type { PatternMatchStepConfig } from './steps/check/PatternMatchStep.js';
export { PatternMatchStep } from './steps/check/PatternMatchStep.js';
export { resolveRef } from './context/resolveRef.js';
export { executeSubPipeline } from './steps/control/executeSubPipeline.js';
export { IfBranchStep } from './steps/control/IfBranchStep.js';
export type { IfStepConfig } from './steps/control/IfStep.js';
export { IfStep } from './steps/control/IfStep.js';
export type { LogLevel, LogStepConfig } from './steps/control/LogStep.js';
export { LogStep } from './steps/control/LogStep.js';
export type { SetVarStepConfig } from './steps/control/SetVarStep.js';
export { SetVarStep } from './steps/control/SetVarStep.js';
export { SwitchBranchStep } from './steps/control/SwitchBranchStep.js';
export type { SwitchStepConfig } from './steps/control/SwitchStep.js';
export { SwitchStep } from './steps/control/SwitchStep.js';
export { executeStep } from './steps/execution/executeStep.js';
export { readStepOutput } from './context/readStepOutput.js';
export { EMPTY_RUNBOOK_READS } from './reads/EMPTY_RUNBOOK_READS.js';
export type { RunbookReads } from './types/RunbookReads.js';
export type { ReadState } from './types/ReadState.js';
export type { ExtractFieldConfig } from './steps/transform/ExtractFieldStep.js';
export { ExtractFieldStep } from './steps/transform/ExtractFieldStep.js';
export type { MapArrayConfig } from './steps/transform/MapStep.js';
export { MapStep } from './steps/transform/MapStep.js';
export type { RegexExtractConfig } from './steps/transform/RegexExtractStep.js';
export { RegexExtractStep } from './steps/transform/RegexExtractStep.js';
export type { TemplateConfig } from './steps/transform/TemplateStep.js';
export { TemplateStep } from './steps/transform/TemplateStep.js';
export type { ActionTrace } from './tracing/ActionTrace.js';
export type { CaseEvaluationTrace } from './tracing/CaseEvaluationTrace.js';
export type { CaseMatchingTrace } from './tracing/CaseMatchingTrace.js';
export type { ExecutionInfo } from './tracing/ExecutionInfo.js';
export type { ExecutionEnvironment } from './tracing/ExecutionEnvironment.js';
export type { ExecutionEnvironmentExtensions } from './tracing/ExecutionEnvironmentExtensions.js';
export type { ExecutionSummary } from './tracing/ExecutionSummary.js';
export type { RunbookExecutionTrace } from './tracing/RunbookExecutionTrace.js';
export type { StepDiagnostics } from './tracing/StepDiagnostics.js';
export type { StepTrace } from './tracing/StepTrace.js';
export { TraceBuilder } from './tracing/TraceBuilder.js';
export type {
  AndCondition,
  CompareCondition,
  Condition,
  ExistsCondition,
  NotCondition,
  OrCondition,
  PatternCondition,
} from './types/Condition.js';
export type { ErrorRecoveryInfo } from './types/ErrorRecoveryInfo.js';
export type { FlowDirective } from './types/FlowDirective.js';
export type { IfBranchConfig } from './types/IfBranchConfig.js';
export type { KnownCase } from './types/KnownCase.js';
export type { KnownCaseDetection } from './types/KnownCaseDetection.js';
export type { IdentifierObservation } from './types/IdentifierObservation.js';
export type { StepCoverage } from './types/StepCoverage.js';
export type { BranchOutcome } from './types/BranchOutcome.js';
export type { DescendRequest } from './types/DescendRequest.js';
export type { ErrorChainInterruptionReason } from './types/ErrorChainInterruptionReason.js';
export type { ErrorNodeSpec } from './types/ErrorNodeSpec.js';
export type { ErrorTreeDefinition } from './types/ErrorTreeDefinition.js';
export type { ErrorTreeNode } from './types/ErrorTreeNode.js';
export type { TreeChain } from './types/TreeChain.js';
export type { TreeChainEnd } from './types/TreeChainEnd.js';
export type { TreeChainInterruption } from './types/TreeChainInterruption.js';
export type { TreeChainGroup } from './types/TreeChainGroup.js';
export type { TreeDescent } from './types/TreeDescent.js';
export type { TreeEnumerated } from './types/TreeEnumerated.js';
export type { TreeEnumeration } from './types/TreeEnumeration.js';
export type { TreeEnumeratorFn } from './types/TreeEnumeratorFn.js';
export type { TreeExclusion } from './types/TreeExclusion.js';
export type { TreeLevel } from './types/TreeLevel.js';
export type { TreeLevelReader } from './types/TreeLevelReader.js';
export type { TreeLevelReadResult } from './types/TreeLevelReadResult.js';
export type { TreeRowAttributionFn } from './types/TreeRowAttributionFn.js';
export type { TreeRowIdentityFn } from './types/TreeRowIdentityFn.js';
export type { TreeSecondAttemptFn } from './types/TreeSecondAttemptFn.js';
export type { TreeVarOwnershipFn } from './types/TreeVarOwnershipFn.js';
export {
  BRANCH_OUTCOME_VAR,
  exclusionVar,
  logCountAllVisitsVar,
  logCountVar,
  lookupStateVar,
} from './tree/descentVarNames.js';
export type { CoverageReason } from './types/CoverageReason.js';
export type { CoverageEntry } from './types/CoverageEntry.js';
export type { ReadIdentifier } from './types/ReadIdentifier.js';
export type { ObservedErrors } from './types/ObservedErrors.js';
export type { EvidenceIdentifier } from './types/EvidenceIdentifier.js';
export type { EvidenceIdentifierKind } from './types/EvidenceIdentifierKind.js';
export type { TimedEvidenceIdentifier } from './types/TimedEvidenceIdentifier.js';
export type { EvidenceTime } from './types/EvidenceTime.js';
export type { EvidenceTimeReaderFn } from './types/EvidenceTimeReaderFn.js';
export type { LogEntry } from './types/LogEntry.js';
export type { PipelineHook } from './types/PipelineHook.js';
export type { Runbook } from './types/Runbook.js';
export type { RunbookContext } from './types/RunbookContext.js';
export type { RunbookExecutionResult } from './types/RunbookExecutionResult.js';
export type { RunbookExecutionStatus } from './types/RunbookExecutionStatus.js';
export type { RunbookMetadata } from './types/RunbookMetadata.js';
export type { RunbookType } from './types/RunbookType.js';
export type { Step } from './types/Step.js';
export type { StepDescriptor } from './types/StepDescriptor.js';
export type { StepKind } from './types/StepKind.js';
export type { StepResult } from './types/StepResult.js';
export type { SwitchBranchConfig } from './types/SwitchBranchConfig.js';
export type { GoToReference } from './validation/GoToGraphAnalyzer.js';
export { GoToGraphAnalyzer } from './validation/GoToGraphAnalyzer.js';
export { RunbookValidationError } from './validation/RunbookValidationError.js';
export type { ValidationErrorCode } from './validation/ValidationErrorCode.js';
export type { ValidationErrorCodes } from './validation/ValidationErrorCodes.js';
export type { ValidationErrorEntry } from './validation/ValidationErrorEntry.js';
export type { WorkflowServices } from './types/WorkflowServices.js';
export type { RunbookEngineOptions } from './types/RunbookEngineOptions.js';
export type { ServiceCapabilityCheck } from './types/ServiceCapabilityCheck.js';
export type { ServiceCapabilityPredicate } from './types/ServiceCapabilityPredicate.js';
export { RunbookMissingServicesError } from './errors/RunbookMissingServicesError.js';
export { collectRunbookSteps } from './core/collectRunbookSteps.js';
export { createTestWorkflowServices } from './testing/createTestWorkflowServices.js';
export type { RunbookExtensions } from './types/RunbookExtensions.js';
export type { KnownCaseExtensions } from './types/KnownCaseExtensions.js';
export type { StepDescriptorExtensions } from './types/StepDescriptorExtensions.js';
export type { LogActionRenderer } from './actions/LogActionRenderer.js';
export type { LogActionValues } from './actions/LogActionValues.js';
export { PLAIN_LOG_ACTION_RENDERER } from './actions/PLAIN_LOG_ACTION_RENDERER.js';
export { resolveActionMessage } from './actions/resolveActionMessage.js';
