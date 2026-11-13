/**
 * Lambda alarm runbook toolkit.
 *
 * Reusable building blocks for runbooks that analyse CloudWatch
 * `LogInvocationErrors` alarms on AWS Lambda functions. Consumed via the
 * `lambda` namespace re-exported from `@pagopa/go-runbook`, mirroring
 * the `apigw` toolkit.
 *
 * @example
 * ```typescript
 * import { lambda } from '@pagopa/go-runbook';
 *
 * const runbook = lambda.createLambdaAlarmRunbook({
 *   id: 'pn-tokenExchangeLambda-LogInvocationErrors-Alarm',
 *   metadata: { name: '...', description: '', version: '1.0.0', type: 'alarm-resolution', team: 'GO', tags: [] },
 *   lambda: { name: 'pn-tokenExchangeLambda', logGroup: '/aws/lambda/pn-tokenExchangeLambda', varPrefix: 'tokenExchange' },
 *   knownCases: [],
 * });
 * ```
 */

export * from '../../../common/families/lambda/index.js';
export { SEND_LAMBDA_PROFILE } from './profiles/SEND_LAMBDA_PROFILE.js';
export { createSendLambdaAlarmRunbook } from './builders/createSendLambdaAlarmRunbook.js';
