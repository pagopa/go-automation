/**
 * Lambda alarm runbook toolkit.
 *
 * Reusable building blocks for runbooks that analyse CloudWatch
 * `LogInvocationErrors` alarms on AWS Lambda functions. Consumed via the
 * `lambda` namespace re-exported from `@go-automation/go-runbook`, mirroring
 * the `apigw` toolkit.
 *
 * @example
 * ```typescript
 * import { lambda } from '@go-automation/go-runbook';
 *
 * const runbook = lambda.createLambdaAlarmRunbook({
 *   id: 'pn-tokenExchangeLambda-LogInvocationErrors-Alarm',
 *   metadata: { name: '...', description: '', version: '1.0.0', type: 'alarm-resolution', team: 'GO', tags: [] },
 *   lambda: { name: 'pn-tokenExchangeLambda', logGroup: '/aws/lambda/pn-tokenExchangeLambda', varPrefix: 'tokenExchange' },
 *   knownCases: [],
 * });
 * ```
 */

export * from './builders/index.js';
export * from './steps/index.js';
export * from './reporting/index.js';
export * from './output/index.js';
export { LAMBDA_RUNTIME_KNOWN_CASES } from './knownCases/LAMBDA_RUNTIME_KNOWN_CASES.js';

// Profiles & queries
export type { LambdaQueryProfile } from './profiles/LambdaQueryProfile.js';
export { SEND_LAMBDA_PROFILE } from './profiles/SEND_LAMBDA_PROFILE.js';
export { DEFAULT_LAMBDA_ERROR_QUERY } from './queries/DEFAULT_LAMBDA_ERROR_QUERY.js';
export { DEFAULT_LAMBDA_INVOCATION_QUERY } from './queries/DEFAULT_LAMBDA_INVOCATION_QUERY.js';

// Types
export type { LambdaAlarmConfig } from './types/LambdaAlarmConfig.js';
export type { LambdaFunction } from './types/LambdaFunction.js';
export type { LambdaEventSource } from './types/LambdaEventSource.js';
export type { LambdaDownstream } from './types/LambdaDownstream.js';
export type { DownstreamErrorPattern } from './types/DownstreamErrorPattern.js';
export type { LambdaErrorCategory } from './types/LambdaErrorCategory.js';
export type { TerminationReason } from './types/TerminationReason.js';

// Helpers
export { parseLambdaReportLine } from './helpers/parseLambdaReportLine.js';
export type { LambdaReportInfo } from './helpers/parseLambdaReportLine.js';
export { extractLambdaRequestId } from './helpers/extractLambdaRequestId.js';
export { classifyLambdaError } from './helpers/classifyLambdaError.js';
export { scanLambdaLogs } from './helpers/scanLambdaLogs.js';
export type { LambdaErrorScan } from './helpers/scanLambdaLogs.js';
export { matchDownstreamErrorPattern } from './helpers/matchDownstreamErrorPattern.js';
