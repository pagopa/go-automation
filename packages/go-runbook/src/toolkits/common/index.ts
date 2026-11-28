/**
 * Generic operational toolkit: entrypoint `@pagopa/go-runbook/toolkits/common`.
 *
 * Service ports, CloudWatch Logs steps, parsing, policies, analysis and known errors,
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

// CloudWatch Logs steps
export { CloudWatchLogsQueryStep } from './steps/aws/cloudwatch-logs/CloudWatchLogsQueryStep.js';
export type { CloudWatchLogsQueryConfig } from './steps/aws/cloudwatch-logs/CloudWatchLogsQueryStep.js';
export { executeCloudWatchLogsQuery } from './steps/aws/cloudwatch-logs/executeCloudWatchLogsQuery.js';
export type { CloudWatchLogsRow } from './steps/aws/cloudwatch-logs/CloudWatchLogsRow.js';
export type { CloudWatchLogsRows } from './steps/aws/cloudwatch-logs/CloudWatchLogsRows.js';
export type { ExecutedCloudWatchLogsQuery } from './steps/aws/cloudwatch-logs/ExecutedCloudWatchLogsQuery.js';
export { mergeCloudWatchLogsDiagnostics } from './steps/aws/cloudwatch-logs/mergeCloudWatchLogsDiagnostics.js';
export { tryCloudWatchLogsRead } from './steps/aws/cloudwatch-logs/tryCloudWatchLogsRead.js';
export type { CloudWatchLogsRead } from './steps/aws/cloudwatch-logs/CloudWatchLogsRead.js';
export type { CloudWatchLogsReadAttempt } from './steps/aws/cloudwatch-logs/CloudWatchLogsReadAttempt.js';
export { readCloudWatchLogsBatches } from './steps/aws/cloudwatch-logs/readCloudWatchLogsBatches.js';
export { logRowIdentity } from './steps/aws/cloudwatch-logs/logRowIdentity.js';
export type { CloudWatchLogsBatchedRead } from './steps/aws/cloudwatch-logs/CloudWatchLogsBatchedRead.js';
export type { CloudWatchLogsBatchedReadResult } from './steps/aws/cloudwatch-logs/CloudWatchLogsBatchedReadResult.js';
export { endsCloudWatchLogsRead } from './steps/aws/cloudwatch-logs/endsCloudWatchLogsRead.js';
export { SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS } from './steps/aws/cloudwatch-logs/SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS.js';
export { QueryAccountLogDiagnosticsStep } from './steps/aws/cloudwatch-logs/QueryAccountLogDiagnosticsStep.js';
export type { AccountLogDiagnostics } from './steps/aws/cloudwatch-logs/AccountLogDiagnostics.js';
export type { AccountLogQuery } from './steps/aws/cloudwatch-logs/AccountLogQuery.js';
export type { AccountLogRead } from './steps/aws/cloudwatch-logs/AccountLogRead.js';
// Logical AWS accounts
export type { AwsLogicalAccount } from './accounts/AwsLogicalAccount.js';
export { parseAwsLogicalAccount } from './accounts/parseAwsLogicalAccount.js';
export { awsLogicalAccountName } from './accounts/awsLogicalAccountName.js';
export type { AwsAccountSelection } from './accounts/AwsAccountSelection.js';
export type { ResolvedAwsAccount } from './accounts/ResolvedAwsAccount.js';
export type { AwsAccountErrorCode } from './accounts/AwsAccountErrorCode.js';
export { AwsAccountError, isAwsAccountError } from './accounts/AwsAccountError.js';
export { resolveAwsAccountSelection } from './accounts/resolveAwsAccountSelection.js';
export { accountScopedContexts } from './accounts/accountScopedContexts.js';
export type { AccountScopedContext } from './accounts/AccountScopedContext.js';
export type { AwsAccountsPort } from './services/ports/AwsAccountsPort.js';
export { InMemoryAwsAccountsPort } from './testing/InMemoryAwsAccountsPort.js';
export type { InMemoryAwsAccountsPortOptions } from './testing/InMemoryAwsAccountsPortOptions.js';
export type { AwsAccountsDirectoryPortOptions } from './accounts/AwsAccountsDirectoryPortOptions.js';
export type { AwsAccountsOccurrence } from './accounts/AwsAccountsOccurrence.js';

// Parsing, queries, time
export type { LogLine } from './parsing/aws/cloudwatch-logs/LogLine.js';
export { readCloudWatchResultRows } from './parsing/aws/cloudwatch-logs/readCloudWatchResultRows.js';
export { canonicalTraceId } from './parsing/traceIds/traceIdentity.js';
export { CloudWatchLogsLevelReader } from './tree/CloudWatchLogsLevelReader.js';
export type { CloudWatchLogsLevelReaderConfig } from './tree/CloudWatchLogsLevelReaderConfig.js';
export { escapeSqlString, extractTemplateParameters } from './queries/interpolateTemplate.js';
export type { TimeRange } from './time/TimeRange.js';
export type { TimeRangeFromParams } from './time/TimeRangeFromParams.js';
export { resolveTimeRange } from './time/resolveTimeRange.js';
export { ALARM_TIME_RANGE } from './time/ALARM_TIME_RANGE.js';

// Telemetry
export type { CloudWatchLogsStepDiagnostics } from './telemetry/CloudWatchLogsStepDiagnostics.js';
export type { AwsExecutionEnvironment } from './telemetry/AwsExecutionEnvironment.js';
export type { AlarmRunbookContext } from './output/AlarmRunbookContext.js';
export type { AlarmOutput } from './output/AlarmOutput.js';

// Policies
export { assertCloudExecutableRunbook } from './policies/assertCloudExecutableRunbook.js';
export type { CloudExecutionPolicy } from './policies/CloudExecutionPolicy.js';

// Output building
export { buildRunbookOutput } from './output/buildRunbookOutput.js';
export type { BuildRunbookOutputOptions } from './output/BuildRunbookOutputOptions.js';
export type { RunbookOutputContextBuilderFn } from './output/RunbookOutputContextBuilderFn.js';
export type { LogSampleOptions } from './output/LogSampleOptions.js';

// Analysis and known errors
export type { RunbookAnalysisDefaults } from './analysis/RunbookAnalysisDefaults.js';
export { knownError } from './analysis/knownError.js';
export type { KnownErrorSpec } from './analysis/knownError.js';
export { UNKNOWN_ERROR_TITLE, unknownErrorFallback } from './analysis/reporting/unknownErrorFallback.js';
export { ANALYSIS_LOG_ACTION_RENDERER } from './analysis/reporting/ANALYSIS_LOG_ACTION_RENDERER.js';
export { assertAnalysisAnnotations } from './analysis/validation/assertAnalysisAnnotations.js';
export type { DownstreamCatalogs } from './analysis/validation/DownstreamCatalogs.js';

// Registration
export { RunbookCatalog } from './registration/RunbookCatalog.js';
export type { RunbookCatalogOptions } from './registration/RunbookCatalogOptions.js';
export type { RunbookRegistration } from './registration/RunbookRegistration.js';
export type { RunbookDescriptor } from './registration/RunbookDescriptor.js';
export type { KnownErrorDescriptor } from './registration/KnownErrorDescriptor.js';
export { knownErrorCodeOf } from './registration/knownErrorCodeOf.js';
export type { ResolvedRunbook } from './registration/ResolvedRunbook.js';
export type { RunbookBuilderFn } from './registration/RunbookBuilderFn.js';
export { RunbookKinds } from './registration/RunbookKind.js';
export type { RunbookKind } from './registration/RunbookKind.js';
export { RunbookProducts } from './registration/RunbookProduct.js';
export type { RunbookProduct } from './registration/RunbookProduct.js';
export { isRunbookProduct } from './registration/isRunbookProduct.js';
export { isRunbookKind } from './registration/isRunbookKind.js';

// Families
export * as apigw from './families/apigw/index.js';
export * as lambda from './families/lambda/index.js';
export * as service from './families/service/index.js';

// Operational model augmentations: keeps the operational fields in a consumer's program.
export type { OperationalModelAugmentations } from './augmentations/index.js';
export { AlarmRunbookBuilder } from './builders/AlarmRunbookBuilder.js';
