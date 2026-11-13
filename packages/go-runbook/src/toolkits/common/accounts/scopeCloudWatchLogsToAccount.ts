import type { OperationalContext } from '../services/OperationalContext.js';
import type { AwsAccountTarget } from './AwsAccountTarget.js';

/**
 * Context whose CloudWatch Logs reader is bound to one account of a
 * multi-account step (EVO-RBREORG-OPUS-01 P30). The other services are unchanged.
 *
 * @param context - Operational context of the step
 * @param target - Account, region and optional local profile
 * @returns A new context; the original is not modified
 */
export function scopeCloudWatchLogsToAccount(
  context: OperationalContext,
  target: AwsAccountTarget,
): OperationalContext {
  const cloudWatchLogs = context.services.cloudWatchLogs.forTarget({
    accountId: target.account.accountId,
    region: target.region,
    ...(target.profile === undefined ? {} : { profile: target.profile }),
  });
  return { ...context, services: { ...context.services, cloudWatchLogs } };
}
