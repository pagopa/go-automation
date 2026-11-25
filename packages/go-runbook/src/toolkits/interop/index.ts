/**
 * INTEROP toolkit for runbook authors: entrypoint `@pagopa/go-runbook/toolkits/interop`.
 *
 * INTEROP runbooks import from here and from the engine barrel only.
 */

export * as apigw from '../common/families/apigw/index.js';
export * as interop from './families/index.js';
export * as service from '../common/families/service/index.js';
export { UNKNOWN_CASE_TITLE, unknownCaseFallback } from '../common/analysis/reporting/unknownCaseFallback.js';
export { INTEROP_DOWNSTREAMS } from './analysis/INTEROP_DOWNSTREAMS.js';
export type { InteropDownstream } from './analysis/INTEROP_DOWNSTREAMS.js';
export { knownCase } from '../common/analysis/knownCase.js';
export type { RunbookRegistration } from '../common/registration/RunbookRegistration.js';
export type { InteropK8sAlarm } from './families/k8s/types/InteropK8sAlarm.js';
export { defineInteropK8sAlarm } from './families/k8s/builders/defineInteropK8sAlarm.js';
export type { InteropApiGwAlarm } from './families/apigw/types/InteropApiGwAlarm.js';
export { createInteropApiGwKnownCaseFactory } from './families/apigw/knownCases/createInteropApiGwKnownCaseFactory.js';
export type { ResolveInteropAlarmContextFn } from './alarms/ResolveInteropAlarmContextFn.js';
export { ResolveInteropAlarmContextStep } from './alarms/ResolveInteropAlarmContextStep.js';
export type { InteropEnvironment } from './environment/InteropEnvironment.js';
export { INTEROP_ENVIRONMENTS } from './environment/INTEROP_ENVIRONMENTS.js';
export { isInteropEnvironment } from './environment/isInteropEnvironment.js';
export type { InteropK8sKnownCaseRefs } from './families/k8s/knownCases/InteropK8sKnownCaseRefs.js';
export { interopK8sKnownCase } from './families/k8s/knownCases/interopK8sKnownCase.js';
export { INTEROP_KAFKA_SIGNATURES } from './families/k8s/knownCases/INTEROP_KAFKA_SIGNATURES.js';
export type { InteropKafkaSignatures } from './families/k8s/knownCases/InteropKafkaSignatures.js';
export { interopErrorLine } from './families/k8s/knownCases/interopErrorLine.js';
export { normalizeInteropApiGwAggregateValue } from './families/apigw/helpers/normalizeInteropApiGwAggregateValue.js';
export { buildAnalysisDraft } from '../common/analysis/draft/buildAnalysisDraft.js';
export { createTestServiceRegistry } from '../common/testing/createTestServiceRegistry.js';
export { CloudWatchLogsQueryStep } from '../common/steps/aws/cloudwatch-logs/CloudWatchLogsQueryStep.js';
export { executeCloudWatchLogsQuery } from '../common/steps/aws/cloudwatch-logs/executeCloudWatchLogsQuery.js';
export type { CloudWatchLogsRow } from '../common/steps/aws/cloudwatch-logs/CloudWatchLogsRow.js';
export type { CloudWatchLogsRows } from '../common/steps/aws/cloudwatch-logs/CloudWatchLogsRows.js';
export { readCloudWatchResultRows } from '../common/parsing/aws/cloudwatch-logs/readCloudWatchResultRows.js';
export { readCidTrackerResults } from './applicationLogs/helpers/readCidTrackerResults.js';
export { readInteropLogRow } from './applicationLogs/helpers/readInteropLogRow.js';
export type { InteropLogRow } from './applicationLogs/helpers/InteropLogRow.js';
export { resolveTimeRange } from '../common/time/resolveTimeRange.js';
export { ALARM_TIME_RANGE } from '../common/time/ALARM_TIME_RANGE.js';
export { RunbookKinds } from '../common/registration/RunbookKind.js';
export { RunbookProducts } from '../common/registration/RunbookProduct.js';
export { assertCloudExecutableRunbook } from '../common/policies/assertCloudExecutableRunbook.js';
export { OperationalStep } from '../common/steps/OperationalStep.js';
export type { OperationalContext } from '../common/services/OperationalContext.js';
export type { OperationalServiceName } from '../common/services/OperationalServiceName.js';

// Operational model augmentations: keeps the operational fields in a consumer's program.
export type { OperationalModelAugmentations } from '../common/augmentations/index.js';
export { AlarmRunbookBuilder } from '../common/builders/AlarmRunbookBuilder.js';
