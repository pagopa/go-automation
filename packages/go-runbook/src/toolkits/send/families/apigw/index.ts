/**
 * API Gateway runbook toolkit.
 *
 * Provides reusable building blocks (helpers, steps, types) for runbooks
 * that analyse alarms originating from API Gateway access logs. Consumed
 * via the `apigw` namespace re-exported from `@pagopa/go-runbook`.
 *
 * @example
 * ```typescript
 * import { apigw } from '@pagopa/go-runbook';
 *
 * const step = apigw.parseApiGwErrors({
 *   id: 'parse-errors',
 *   label: 'Parse API Gateway errors',
 *   fromStep: 'query-api-gw',
 * });
 * ```
 */

export * from '../../../common/families/apigw/index.js';
export { createSendApiGwAlarmRunbook } from './builders/createSendApiGwAlarmRunbook.js';
export { isSendApiGwRunbookContext } from './output/SendApiGwRunbookContext.js';
export type { SendApiGwRunbookContext } from './output/SendApiGwRunbookContext.js';
export { isExecutionLogEnabled, getEffectiveExecutionLogGroup } from './builders/executionLogEnablement.js';
export { API_GW_AUTHORIZER_LAMBDAS } from './authorizers/ApiGwAuthorizerLambdaRegistry.js';
export type { ApiGwAuthorizerLambdaName } from './authorizers/ApiGwAuthorizerLambdaRegistry.js';
export { scanServiceLogs } from './correlation/scanServiceLogs.js';
export type { KnownUrlInLogs, ServiceLogsScan } from './correlation/scanServiceLogs.js';
export type { TraceIdCandidateMatch } from '../../../common/parsing/applicationLogs/TraceIdCandidateMatch.js';
export type { ServiceLogSpec } from './profiles/ServiceLogSpec.js';
export type { ApiGwQueryProfile } from './profiles/ApiGwQueryProfile.js';
export { SEND_API_GW_PROFILE } from './profiles/SEND_API_GW_PROFILE.js';
export { resolveApiGwQueryProfile } from './profiles/resolveApiGwQueryProfile.js';
export { AnalyzeTraversedServiceLogsStep } from './steps/AnalyzeTraversedServiceLogsStep.js';
export type { AnalyzeTraversedServiceLogsConfig } from './steps/AnalyzeTraversedServiceLogsStep.js';
export type { ServiceLogsAnalysis } from './steps/ServiceLogsAnalysis.js';
export { DecideNextStep } from './steps/DecideNextStep.js';
export type { DecideNextConfig, DecideNextOutput } from './steps/DecideNextStep.js';
export { QueryServiceLogsStep } from './steps/QueryServiceLogsStep.js';
export type { QueryServiceLogsConfig } from './steps/QueryServiceLogsStep.js';
export {
  API_GW_LAST_SERVICE_VAR,
  API_GW_QUERY_COUNTER_VAR,
  API_GW_VISIT_COUNTER_VAR,
  apiGwServiceVisitVars,
  planApiGwServiceVisit,
  updateApiGwServicesVisitedChain,
  type ApiGwCurrentQueryIdentifier,
  type ApiGwQueryIdentifierMode,
  type ApiGwServiceVisitPlan,
} from './state/ApiGwAnalysisState.js';
export type { ApiGwPipelineAnchor } from './types/ApiGwPipelineAnchor.js';
export type { ApiGwAlarmConfig } from './types/ApiGwAlarmConfig.js';
export type { ApiGwTerminationReason } from './types/ApiGwTerminationReason.js';
export { ApiGwServiceChainReporter } from './reporting/ApiGwServiceChainReporter.js';
export { renderApiGwFinalSummary } from './reporting/renderApiGwFinalSummary.js';
export type { ApiGwFinalSummaryInput } from './reporting/ApiGwFinalSummaryInput.js';
export type { ApiGwReporterServiceSummary } from './reporting/ApiGwReporterServiceSummary.js';
export type { ApiGwReporterTermination } from './reporting/ApiGwReporterTermination.js';
