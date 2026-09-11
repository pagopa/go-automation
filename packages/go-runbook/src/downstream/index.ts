/**
 * Downstream detection runbook toolkit.
 *
 * A downstream runbook is a service runbook whose scan looks for the
 * `[DOWNSTREAM] Service … returned errors=` markers the application writes,
 * rather than every error line. Consumed via the `downstream` namespace
 * re-exported from `@go-automation/go-runbook`.
 */

export { createDownstreamAlarmRunbook } from './builders/createDownstreamAlarmRunbook.js';
export type { DownstreamAlarmConfig } from './types/DownstreamAlarmConfig.js';
export type { DownstreamSelector } from './types/DownstreamSelector.js';
