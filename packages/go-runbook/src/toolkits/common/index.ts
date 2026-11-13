/**
 * Generic operational toolkit: entrypoint `@pagopa/go-runbook/toolkits/common`
 * (EVO-RBREORG-OPUS-01 §7.2, §8.1).
 *
 * Service ports, AWS/HTTP steps, parsing, policies, analysis and known cases,
 * registration, the generic families (`apigw`, `lambda`, `service`) as
 * namespaces, and the test service registry. It knows no product: SEND and
 * INTEROP data live in `./toolkits/send` and `./toolkits/interop`.
 *
 * @example
 * ```typescript
 * import { CloudWatchLogsQueryStep, createTestServiceRegistry, lambda } from '@pagopa/go-runbook/toolkits/common';
 * ```
 */

// Services and ports
export type { ServiceRegistry } from './services/ServiceRegistry.js';
export type { ResolvedServiceRegistry } from './services/ResolvedServiceRegistry.js';
export type { ServiceRegistryResolverFn } from './services/ServiceRegistryResolverFn.js';
export type { RunbookAthenaPort } from './services/ports/RunbookAthenaPort.js';
export type { RunbookAthenaQueryOptions } from './services/ports/RunbookAthenaQueryOptions.js';
export type { RunbookCloudWatchMetricsPort } from './services/ports/RunbookCloudWatchMetricsPort.js';
export type { RunbookMetricDatapoint } from './services/ports/RunbookMetricDatapoint.js';
export type { RunbookMetricDimension } from './services/ports/RunbookMetricDimension.js';
export type { RunbookDynamoDBPort } from './services/ports/RunbookDynamoDBPort.js';
export type { RunbookDynamoDBAttributeValue } from './services/ports/RunbookDynamoDBAttributeValue.js';
export { createTestServiceRegistry, recordedServiceCalls } from './testing/createTestServiceRegistry.js';
export type { TestServiceOverrides } from './testing/TestServiceOverrides.js';
export type { TestServiceCall } from './testing/TestServiceCall.js';
export { UnexpectedServiceCallError } from './testing/UnexpectedServiceCallError.js';

// Operational steps and services contract
export { OperationalStep } from './steps/OperationalStep.js';
export type { OperationalContext } from './services/OperationalContext.js';
export type { OperationalServiceName } from './services/OperationalServiceName.js';
export {
  OPERATIONAL_SERVICE_CAPABILITIES,
  OPERATIONAL_SERVICE_METHODS,
} from './services/OPERATIONAL_SERVICE_CAPABILITIES.js';
export { OperationalRunbookEngine } from './engine/OperationalRunbookEngine.js';

// AWS and HTTP steps
export { CloudWatchLogsQueryStep } from './steps/aws/cloudwatch-logs/CloudWatchLogsQueryStep.js';
export type { CloudWatchLogsQueryConfig } from './steps/aws/cloudwatch-logs/CloudWatchLogsQueryStep.js';
export { executeCloudWatchLogsQuery } from './steps/aws/cloudwatch-logs/executeCloudWatchLogsQuery.js';
export type { ExecutedCloudWatchLogsQuery } from './steps/aws/cloudwatch-logs/executeCloudWatchLogsQuery.js';
export { CloudWatchMetricsStep } from './steps/aws/cloudwatch-metrics/CloudWatchMetricsStep.js';
export type { CloudWatchMetricsConfig } from './steps/aws/cloudwatch-metrics/CloudWatchMetricsStep.js';
export { AthenaQueryStep } from './steps/aws/athena/AthenaQueryStep.js';
export type { AthenaQueryConfig } from './steps/aws/athena/AthenaQueryStep.js';
export { DynamoDBQueryStep } from './steps/aws/dynamodb/DynamoDBQueryStep.js';
export type { DynamoDBQueryConfig } from './steps/aws/dynamodb/DynamoDBQueryStep.js';
export { DynamoDBGetStep } from './steps/aws/dynamodb/DynamoDBGetStep.js';
export type { DynamoDBGetConfig } from './steps/aws/dynamodb/DynamoDBGetStep.js';
export { DynamoDBPutStep } from './steps/aws/dynamodb/DynamoDBPutStep.js';
export type { DynamoDBPutConfig } from './steps/aws/dynamodb/DynamoDBPutStep.js';
export { DynamoDBUpdateStep } from './steps/aws/dynamodb/DynamoDBUpdateStep.js';
export type { DynamoDBUpdateConfig } from './steps/aws/dynamodb/DynamoDBUpdateStep.js';
export { HttpRequestStep } from './steps/networking/HttpRequestStep.js';
export type { HttpRequestConfig } from './steps/networking/HttpRequestStep.js';
export { HttpPostStep } from './steps/networking/HttpPostStep.js';
export type { HttpPostConfig } from './steps/networking/HttpPostStep.js';

// Parsing, queries, time
export type { LogLine } from './parsing/aws/cloudwatch-logs/LogLine.js';
export { readCloudWatchResultRows } from './parsing/aws/cloudwatch-logs/readCloudWatchResultRows.js';
export { escapeSqlString, extractTemplateParameters } from './queries/interpolateTemplate.js';
export type { TimeRange } from './time/TimeRange.js';
export type { TimeRangeFromParams } from './time/TimeRangeFromParams.js';
export { resolveTimeRange } from './time/resolveTimeRange.js';

// Telemetry
export type { CloudWatchLogsStepDiagnostics } from './telemetry/CloudWatchLogsStepDiagnostics.js';
export type { AwsExecutionEnvironment } from './telemetry/AwsExecutionEnvironment.js';
export type { AlarmRunbookContext } from './output/AlarmRunbookContext.js';

// Policies
export { assertCloudExecutableRunbook } from './policies/assertCloudExecutableRunbook.js';
export type { CloudExecutionPolicy } from './policies/CloudExecutionPolicy.js';

// Output building
export { buildRunbookOutput } from './output/buildRunbookOutput.js';
export type { BuildRunbookOutputOptions, RunbookOutputContextBuilderFn } from './output/buildRunbookOutput.js';

// Analysis and known cases
export type { RunbookAnalysisDefaults } from './analysis/RunbookAnalysisDefaults.js';
export { knownCase } from './analysis/knownCase.js';
export type { KnownCaseSpec } from './analysis/knownCase.js';
export { UNKNOWN_CASE_TITLE, unknownCaseFallback } from './analysis/reporting/unknownCaseFallback.js';
export { ANALYSIS_LOG_ACTION_RENDERER } from './analysis/reporting/ANALYSIS_LOG_ACTION_RENDERER.js';
export { assertAnalysisAnnotations } from './analysis/validation/assertAnalysisAnnotations.js';
export type { DownstreamCatalogs } from './analysis/validation/DownstreamCatalogs.js';

// Registration
export { RunbookCatalog } from './registration/RunbookCatalog.js';
export type { RunbookCatalogOptions } from './registration/RunbookCatalogOptions.js';
export type { RunbookRegistration } from './registration/RunbookRegistration.js';
export type { RunbookDescriptor } from './registration/RunbookDescriptor.js';
export type { ResolvedRunbook } from './registration/ResolvedRunbook.js';
export type { RunbookBuilderFn } from './registration/RunbookBuilderFn.js';
export { RunbookKinds } from './registration/RunbookKind.js';
export type { RunbookKind } from './registration/RunbookKind.js';
export { RunbookProducts } from './registration/RunbookProduct.js';
export type { RunbookProduct } from './registration/RunbookProduct.js';

// Families
export * as apigw from './families/apigw/index.js';
export * as lambda from './families/lambda/index.js';
export * as service from './families/service/index.js';

// Operational model augmentations: keeps the operational fields in a consumer's program (EVO-RBREORG-OPUS-01 RBREORG-11).
export type { OperationalModelAugmentations } from './augmentations/index.js';
export { AlarmRunbookBuilder } from './builders/AlarmRunbookBuilder.js';
