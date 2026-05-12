/**
 * API Gateway runbook toolkit.
 *
 * Provides reusable building blocks (helpers, steps, types) for runbooks
 * that analyse alarms originating from API Gateway access logs. Consumed
 * via the `apigw` namespace re-exported from `@go-automation/go-runbook`.
 *
 * @example
 * ```typescript
 * import { apigw } from '@go-automation/go-runbook';
 *
 * const step = apigw.parseApiGwErrors({
 *   id: 'parse-errors',
 *   label: 'Parse API Gateway errors',
 *   fromStep: 'query-api-gw',
 * });
 * ```
 */

export * from './builders/index.js';
export * from './helpers/index.js';
export * from './queries/index.js';
export * from './registries/index.js';
export * from './reporting/index.js';
export * from './steps/index.js';
export * from './types/index.js';
