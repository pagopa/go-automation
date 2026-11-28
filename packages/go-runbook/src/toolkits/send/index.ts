/**
 * SEND toolkit for runbook authors: entrypoint `@pagopa/go-runbook/toolkits/send`.
 *
 * SEND runbooks import from here and from the engine barrel only.
 */

export * as apigw from './families/apigw/index.js';
export * as downstream from './families/downstream/index.js';
export * as lambda from './families/lambda/index.js';
export * as service from './families/service/index.js';
export { unknownErrorFallback } from '../common/analysis/reporting/unknownErrorFallback.js';
export { SEND_DOWNSTREAMS } from './analysis/SEND_DOWNSTREAMS.js';
export type { SendDownstream } from './analysis/SEND_DOWNSTREAMS.js';
export { downstreamMarkerPattern } from './analysis/downstreamMarkerPattern.js';
export type { DownstreamMarkerParts } from './analysis/DownstreamMarkerParts.js';
export { apiGwPathMatches, apiGwStatusIs } from '../common/families/apigw/conditions/conditions.js';
export { knownError } from '../common/analysis/knownError.js';
export type { RunbookRegistration } from '../common/registration/RunbookRegistration.js';
export { lambdaLogEvidenceMatches } from '../common/families/lambda/conditions/lambdaLogEvidenceMatches.js';
export { scanLambdaLogs } from '../common/families/lambda/helpers/scanLambdaLogs.js';
export { boundedText } from '../common/parsing/correlation/boundedText.js';
export { DEFAULT_LAMBDA_ERROR_QUERY } from '../common/families/lambda/queries/DEFAULT_LAMBDA_ERROR_QUERY.js';
export { LambdaReporter } from '../common/families/lambda/reporting/LambdaReporter.js';
export type { AnalysisDraftV1 } from '../common/analysis/draft/AnalysisDraft.js';
export { buildAnalysisDraft } from '../common/analysis/draft/buildAnalysisDraft.js';
export { buildRunbookOutput } from '../common/output/buildRunbookOutput.js';
export type { KnownErrorAnalysisDraft } from '../common/analysis/draft/KnownErrorAnalysisDraft.js';
export type { AnalysisType } from '../common/analysis/AnalysisType.js';
export type { ProposedAnalysisStatus } from '../common/analysis/ProposedAnalysisStatus.js';
export type { RunbookOutput } from '../common/output/RunbookOutput.js';
export { createTestServiceRegistry } from '../common/testing/createTestServiceRegistry.js';
export type { ServiceRegistry } from '../common/services/ServiceRegistry.js';
export type { ExecutedCloudWatchLogsQuery } from '../common/steps/aws/cloudwatch-logs/ExecutedCloudWatchLogsQuery.js';
export type { CloudWatchLogsRow } from '../common/steps/aws/cloudwatch-logs/CloudWatchLogsRow.js';
export type { CloudWatchLogsRows } from '../common/steps/aws/cloudwatch-logs/CloudWatchLogsRows.js';
export { executeCloudWatchLogsQuery } from '../common/steps/aws/cloudwatch-logs/executeCloudWatchLogsQuery.js';
export { mergeCloudWatchLogsDiagnostics } from '../common/steps/aws/cloudwatch-logs/mergeCloudWatchLogsDiagnostics.js';
export { tryCloudWatchLogsRead } from '../common/steps/aws/cloudwatch-logs/tryCloudWatchLogsRead.js';
export { readCloudWatchLogsBatches } from '../common/steps/aws/cloudwatch-logs/readCloudWatchLogsBatches.js';
export { logRowIdentity } from '../common/steps/aws/cloudwatch-logs/logRowIdentity.js';
export type { CloudWatchLogsBatchedReadResult } from '../common/steps/aws/cloudwatch-logs/CloudWatchLogsBatchedReadResult.js';
export { endsCloudWatchLogsRead } from '../common/steps/aws/cloudwatch-logs/endsCloudWatchLogsRead.js';
export { SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS } from '../common/steps/aws/cloudwatch-logs/SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS.js';
export { QueryAccountLogDiagnosticsStep } from '../common/steps/aws/cloudwatch-logs/QueryAccountLogDiagnosticsStep.js';
export type { AccountLogDiagnostics } from '../common/steps/aws/cloudwatch-logs/AccountLogDiagnostics.js';
export type { AccountLogQuery } from '../common/steps/aws/cloudwatch-logs/AccountLogQuery.js';
export type { AccountLogRead } from '../common/steps/aws/cloudwatch-logs/AccountLogRead.js';
export type { AwsLogicalAccount } from '../common/accounts/AwsLogicalAccount.js';
export { parseAwsLogicalAccount } from '../common/accounts/parseAwsLogicalAccount.js';
export type { AwsAccountSelection } from '../common/accounts/AwsAccountSelection.js';
export type { ResolvedAwsAccount } from '../common/accounts/ResolvedAwsAccount.js';
export { resolveAwsAccountSelection } from '../common/accounts/resolveAwsAccountSelection.js';
export { accountScopedContexts } from '../common/accounts/accountScopedContexts.js';
export type { AccountScopedContext } from '../common/accounts/AccountScopedContext.js';
export { InMemoryAwsAccountsPort } from '../common/testing/InMemoryAwsAccountsPort.js';
export { awsLogicalAccountName } from '../common/accounts/awsLogicalAccountName.js';
export { SEND_ACCOUNTS } from './accounts/SEND_ACCOUNTS.js';
export { resolveTimeRange } from '../common/time/resolveTimeRange.js';
export { ALARM_TIME_RANGE } from '../common/time/ALARM_TIME_RANGE.js';
export type { TimeRangeFromParams } from '../common/time/TimeRangeFromParams.js';
export { RunbookKinds } from '../common/registration/RunbookKind.js';
export { RunbookProducts } from '../common/registration/RunbookProduct.js';
export type { TimeRange } from '../common/time/TimeRange.js';
export { assertCloudExecutableRunbook } from '../common/policies/assertCloudExecutableRunbook.js';
export { OperationalStep } from '../common/steps/OperationalStep.js';
export type { OperationalContext } from '../common/services/OperationalContext.js';
export type { OperationalServiceName } from '../common/services/OperationalServiceName.js';

// Operational model augmentations: keeps the operational fields in a consumer's program.
export type { OperationalModelAugmentations } from '../common/augmentations/index.js';
export { AlarmRunbookBuilder } from '../common/builders/AlarmRunbookBuilder.js';
