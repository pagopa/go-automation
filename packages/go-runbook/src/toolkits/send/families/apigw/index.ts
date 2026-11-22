/**
 * API Gateway runbook toolkit.
 *
 * Provides reusable building blocks (helpers, steps, types) for runbooks
 * that analyse alarms originating from API Gateway access logs. Consumed
 * via the `apigw` namespace of `@pagopa/go-runbook/toolkits/send`, which adds the
 * SEND pipeline and profile to the generic family of `./toolkits/common`.
 *
 * @example
 * ```typescript
 * import { apigw } from '@pagopa/go-runbook/toolkits/send';
 *
 * const step = new apigw.ParseApiGwErrorsStep({
 *   id: 'parse-errors',
 *   label: 'Parse API Gateway errors',
 *   fromStep: 'query-api-gw',
 *   schema: apigw.SEND_API_GW_PROFILE.accessLog.schema,
 *   queryProfileId: apigw.SEND_API_GW_PROFILE.id,
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
export type { KnownUrlInLogs } from './correlation/KnownUrlInLogs.js';
export type { ServiceLogsScan } from './correlation/ServiceLogsScan.js';
export type { TraceIdCandidateMatch } from '../../../common/parsing/traceIds/TraceIdCandidateMatch.js';
export type { ServiceLogSpec } from './profiles/ServiceLogSpec.js';
export type { ApiGwQueryProfile } from './profiles/ApiGwQueryProfile.js';
export { SEND_API_GW_PROFILE } from './profiles/SEND_API_GW_PROFILE.js';
export { resolveApiGwQueryProfile } from './profiles/resolveApiGwQueryProfile.js';
export { QueryServiceLogsStep } from './steps/QueryServiceLogsStep.js';
export type { QueryServiceLogsConfig } from './steps/QueryServiceLogsStep.js';
export type { ApiGwPipelineAnchor } from './types/ApiGwPipelineAnchor.js';
export type { ApiGwAlarmConfig } from './types/ApiGwAlarmConfig.js';
