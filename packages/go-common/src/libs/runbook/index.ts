/**
 * Runbook Engine
 *
 * Provides a declarative, composable framework for defining and executing
 * operational runbooks with support for AWS service integration, flow control,
 * condition-based case matching, and detailed execution tracing.
 *
 * @example
 * ```typescript
 * import { Runbook } from '@go-automation/go-common';
 *
 * const runbook = Runbook.RunbookBuilder.create('alarm-api-gw-5xx')
 *   .metadata({ name: 'API GW 5xx', ... })
 *   .step(Runbook.queryCloudWatchLogs({ ... }))
 *   .knownCase({ ... })
 *   .fallback(Runbook.logAction({ ... }))
 *   .build();
 *
 * const engine = new Runbook.RunbookEngine(logger, new Runbook.ConditionEvaluator());
 * const result = await engine.execute(runbook, params, services);
 * ```
 */

// Types
export type { StepKind } from './types/StepKind.js';
export type { FlowDirective } from './types/FlowDirective.js';
export type { Step } from './types/Step.js';
export type { StepResult } from './types/StepResult.js';
export type { StepDescriptor } from './types/StepDescriptor.js';
export type { RunbookType } from './types/RunbookType.js';
export type { RunbookMetadata } from './types/RunbookMetadata.js';
export type { RunbookContext } from './types/RunbookContext.js';
export type { RunbookExecutionResult } from './types/RunbookExecutionResult.js';
export type { Runbook } from './types/Runbook.js';
export type { KnownCase } from './types/KnownCase.js';
export type {
  Condition,
  CompareCondition,
  PatternCondition,
  ExistsCondition,
  AndCondition,
  OrCondition,
  NotCondition,
} from './types/Condition.js';
export type { LogEntry } from './types/LogEntry.js';
export type { TimeRange } from './types/TimeRange.js';
export type { ErrorRecoveryInfo } from './types/ErrorRecoveryInfo.js';
export type { IfBranchConfig } from './types/IfBranchConfig.js';
export type { SwitchBranchConfig } from './types/SwitchBranchConfig.js';

// Core
export { RunbookEngine } from './core/RunbookEngine.js';
export { ConditionEvaluator } from './core/ConditionEvaluator.js';

// Context
export {
  createInitialContext,
  updateContextWithStepResult,
  addLogEntry,
  addRecoveredError,
  mergeChildContext,
} from './context/RunbookContextHelper.js';

// Errors
export { RunbookMaxIterationsError } from './errors/RunbookMaxIterationsError.js';

// Validation
export { RunbookValidationError } from './validation/RunbookValidationError.js';
export type { ValidationErrorEntry } from './validation/ValidationErrorEntry.js';
export type { ValidationErrorCode } from './validation/ValidationErrorCode.js';
export { GoToGraphAnalyzer } from './validation/GoToGraphAnalyzer.js';
export type { GoToReference } from './validation/GoToGraphAnalyzer.js';

// Trace
export type { RunbookExecutionTrace } from './trace/RunbookExecutionTrace.js';
export type { ExecutionInfo, ExecutionEnvironment } from './trace/ExecutionInfo.js';
export type { StepTrace } from './trace/StepTrace.js';
export type { CaseMatchingTrace } from './trace/CaseMatchingTrace.js';
export type { CaseEvaluationTrace } from './trace/CaseEvaluationTrace.js';
export type { ActionTrace } from './trace/ActionTrace.js';
export type { ExecutionSummary } from './trace/ExecutionSummary.js';
export type { EarlyResolutionTrace } from './trace/EarlyResolutionTrace.js';
export { TraceBuilder } from './trace/TraceBuilder.js';

// Actions
export type {
  CaseAction,
  LogAction,
  NotifyAction,
  UpdateAction,
  EscalateAction,
  CompositeAction,
} from './actions/CaseAction.js';
export { ActionExecutor } from './actions/ActionExecutor.js';
export type { ActionExecutionResult } from './actions/ActionExecutor.js';
export { logAction, notifyAction, escalateAction, compositeAction } from './actions/ActionFactories.js';

// Services
export type { ServiceRegistry } from './services/ServiceRegistry.js';
export { CloudWatchLogsService } from './services/CloudWatchLogsService.js';
export { CloudWatchMetricsService } from './services/CloudWatchMetricsService.js';
export type { MetricDatapoint, MetricDimension } from './services/CloudWatchMetricsService.js';
export { AthenaService } from './services/AthenaService.js';
export { RunbookDynamoDBService } from './services/RunbookDynamoDBService.js';
export { RunbookHttpService } from './services/RunbookHttpService.js';
export type { RunbookHttpResponse } from './services/RunbookHttpService.js';

// Steps
export * from './steps/index.js';

// Builder
export { RunbookBuilder } from './builders/RunbookBuilder.js';
