/**
 * Service alarm runbook toolkit.
 *
 * Reusable building blocks for runbooks where the alarm origin is less
 * important than the application log group used for diagnosis. Consumed via
 * the `service` namespace of `@pagopa/go-runbook/toolkits/send`.
 */

export * from '../../../common/families/service/index.js';
export { SEND_SERVICE_PROFILE } from './profiles/SEND_SERVICE_PROFILE.js';
export { createSendServiceAlarmRunbook } from './builders/createSendServiceAlarmRunbook.js';
