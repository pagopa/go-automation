/**
 * Generic lambda family of the operational toolkit: no product data (EVO-RBREORG-OPUS-01 §7.2).
 * Product toolkits re-export it inside their own `lambda` namespace, adding their pipelines and profiles.
 */

export { createLambdaAlarmRunbook } from './builders/createLambdaAlarmRunbook.js';
export { resolveLambdaAlarmBuildContext } from './builders/resolveLambdaAlarmBuildContext.js';
export type { LambdaAlarmBuildContext } from './builders/resolveLambdaAlarmBuildContext.js';
export { defaultLambdaUnknownCaseFallback } from './builders/defaultLambdaUnknownCaseFallback.js';
export { PrepareLambdaSectionStep } from './steps/PrepareLambdaSectionStep.js';
export type { PrepareLambdaSectionConfig } from './steps/PrepareLambdaSectionStep.js';
export { ParseLambdaErrorsStep } from './steps/ParseLambdaErrorsStep.js';
export type { ParseLambdaErrorsConfig } from './steps/ParseLambdaErrorsStep.js';
export { QueryLambdaInvocationStep } from './steps/QueryLambdaInvocationStep.js';
export type { QueryLambdaInvocationConfig } from './steps/QueryLambdaInvocationStep.js';
export { AnalyzeLambdaInvocationStep } from './steps/AnalyzeLambdaInvocationStep.js';
export type { AnalyzeLambdaInvocationConfig } from './steps/AnalyzeLambdaInvocationStep.js';
export { QueryDownstreamLogsStep } from './steps/QueryDownstreamLogsStep.js';
export type { QueryDownstreamLogsConfig } from './steps/QueryDownstreamLogsStep.js';
export { LambdaReporter } from './reporting/LambdaReporter.js';
export type { LambdaResultInfo, LambdaTermination } from './reporting/LambdaReporter.js';
export { renderLambdaFinalSummary } from './reporting/renderLambdaFinalSummary.js';
export type { LambdaFinalSummaryInput } from './reporting/renderLambdaFinalSummary.js';
export type { LambdaRunbookContext } from './output/LambdaRunbookContext.js';
export { isLambdaRunbookContext } from './output/LambdaRunbookContext.js';
export type { LambdaOutputContext, LambdaDownstreamOutput } from './output/LambdaOutputContext.js';
export { buildLambdaOutputContext } from './output/buildLambdaOutputContext.js';
export type { BuildLambdaOutputContextOptions } from './output/buildLambdaOutputContext.js';
export { LAMBDA_RUNTIME_KNOWN_CASES } from './knownCases/LAMBDA_RUNTIME_KNOWN_CASES.js';
export type { LambdaQueryProfile } from './profiles/LambdaQueryProfile.js';
export { DEFAULT_LAMBDA_PROFILE } from './profiles/DEFAULT_LAMBDA_PROFILE.js';
export { DEFAULT_LAMBDA_ERROR_QUERY } from './queries/DEFAULT_LAMBDA_ERROR_QUERY.js';
export { DEFAULT_LAMBDA_INVOCATION_QUERY } from './queries/DEFAULT_LAMBDA_INVOCATION_QUERY.js';
export type { LambdaAlarmConfig } from './types/LambdaAlarmConfig.js';
export type { LambdaPipelineAnchor } from './types/LambdaPipelineAnchor.js';
export type { LambdaFunction } from './types/LambdaFunction.js';
export type { LambdaEventSource } from './types/LambdaEventSource.js';
export type { LambdaDownstream } from './types/LambdaDownstream.js';
export type { DownstreamErrorPattern } from './types/DownstreamErrorPattern.js';
export type { LambdaErrorCategory } from './types/LambdaErrorCategory.js';
export type { LambdaTerminationReason } from './types/LambdaTerminationReason.js';
export { parseLambdaReportLine } from './helpers/parseLambdaReportLine.js';
export type { LambdaReportInfo } from './helpers/parseLambdaReportLine.js';
export { extractLambdaRequestId } from './helpers/extractLambdaRequestId.js';
export { classifyLambdaError } from './helpers/classifyLambdaError.js';
export { scanLambdaLogs } from './helpers/scanLambdaLogs.js';
export type { LambdaErrorScan } from './helpers/scanLambdaLogs.js';
export { matchDownstreamErrorPattern } from './helpers/matchDownstreamErrorPattern.js';
