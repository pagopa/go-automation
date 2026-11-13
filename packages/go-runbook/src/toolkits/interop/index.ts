/**
 * Internal API of the INTEROP toolkit for runbook authors (EVO-RBREORG-OPUS-01, phase F1).
 *
 * INTEROP runbooks import from here and from the engine barrel only. In F1 it
 * re-exports from the current folders; F2 moves the INTEROP helpers here and F4
 * publishes it as `./toolkits/interop`. It is not reachable from any entrypoint yet.
 */

export * as apigw from '../common/families/apigw/index.js';
export * as interop from './families/index.js';
export * as service from '../common/families/service/index.js';
export { UNKNOWN_CASE_TITLE, unknownCaseFallback } from '../common/analysis/reporting/unknownCaseFallback.js';
export { INTEROP_DOWNSTREAMS } from './analysis/INTEROP_DOWNSTREAMS.js';
export type { InteropDownstream } from './analysis/INTEROP_DOWNSTREAMS.js';
export { knownCase } from '../common/analysis/knownCase.js';
export type { RunbookRegistration } from '../common/registration/RunbookRegistration.js';
export type { InteropK8sAlarm } from './families/k8s/builders/defineInteropK8sAlarm.js';
export { defineInteropK8sAlarm } from './families/k8s/builders/defineInteropK8sAlarm.js';
export type { InteropApiGwAlarm } from './families/apigw/types/InteropApiGwAlarm.js';
export { createInteropApiGwKnownCaseFactory } from './families/apigw/knownCases/createInteropApiGwKnownCaseFactory.js';
export type { InteropEnvironment } from './environment/InteropEnvironment.js';
export { INTEROP_ENVIRONMENTS } from './environment/INTEROP_ENVIRONMENTS.js';
export { isInteropEnvironment } from './environment/isInteropEnvironment.js';
export type { InteropK8sKnownCaseRefs } from './families/k8s/knownCases/interopK8sKnownCase.js';
export { interopK8sKnownCase } from './families/k8s/knownCases/interopK8sKnownCase.js';
export { normalizeInteropApiGwAggregateValue } from './families/apigw/helpers/normalizeInteropApiGwAggregateValue.js';
export { INTEROP_API_GW_STATUS_AGGREGATE_QUERY_LIMIT } from './families/apigw/queries/buildInteropApiGwStatusAggregateQuery.js';
export { INTEROP_API_GW_APPLICATION_QUERY_LIMIT } from './families/apigw/queries/interopApiGwApplicationQueries.js';
export type { InteropApiGwAlarmContext } from './families/apigw/types/InteropApiGwAlarmContext.js';
export { buildInteropK8sCidTrackerQuery } from './applicationLogs/queries/interopK8sQueries.js';
export { buildAnalysisDraft } from '../common/analysis/draft/buildAnalysisDraft.js';
export { createTestServiceRegistry } from '../common/testing/createTestServiceRegistry.js';
export { CloudWatchLogsQueryStep } from '../common/steps/aws/cloudwatch-logs/CloudWatchLogsQueryStep.js';
export { executeCloudWatchLogsQuery } from '../common/steps/aws/cloudwatch-logs/executeCloudWatchLogsQuery.js';
export { readCloudWatchResultRows } from '../common/parsing/aws/cloudwatch-logs/readCloudWatchResultRows.js';
export { resolveTimeRange } from '../common/time/resolveTimeRange.js';
export { RunbookKinds } from '../common/registration/RunbookKind.js';
export { RunbookProducts } from '../common/registration/RunbookProduct.js';
export { assertAnalysisAnnotations } from '../common/analysis/validation/assertAnalysisAnnotations.js';
export { assertCloudExecutableRunbook } from '../common/policies/assertCloudExecutableRunbook.js';
export { OperationalStep } from '../common/steps/OperationalStep.js';
export type { OperationalContext } from '../common/services/OperationalContext.js';
export type { OperationalServiceName } from '../common/services/OperationalServiceName.js';

// Operational model augmentations: keeps the operational fields in a consumer's program (EVO-RBREORG-OPUS-01 RBREORG-11).
export type { OperationalModelAugmentations } from '../common/augmentations/index.js';
export { AlarmRunbookBuilder } from '../common/builders/AlarmRunbookBuilder.js';
