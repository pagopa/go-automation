/**
 * Service alarm runbook toolkit.
 *
 * Reusable building blocks for runbooks where the alarm origin is less
 * important than the application log group used for diagnosis. Consumed via
 * the `service` namespace re-exported from `@pagopa/go-runbook`.
 */

export * from '../../../common/families/service/index.js';
export { SEND_SERVICE_PROFILE } from './profiles/SEND_SERVICE_PROFILE.js';
export { createSendServiceAlarmRunbook } from './builders/createSendServiceAlarmRunbook.js';
export { buildDownstreamDetectionQuery } from '../downstream/queries/buildDownstreamDetectionQuery.js';
export type { DownstreamDetectionQueryOptions } from '../downstream/queries/buildDownstreamDetectionQuery.js';
