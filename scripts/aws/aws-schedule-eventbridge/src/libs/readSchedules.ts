/**
 * Phase 1 of the sweep: reads the target schedule from every configured account.
 *
 * Shared with the `describe` action, which needs exactly the same fan-out.
 */

import { AWS, type Core } from '@go-automation/go-common';

import type { AwsScheduleEventbridgeConfig, ScheduleRead } from '../types/index.js';
import { isScheduleNotFound } from './isScheduleNotFound.js';

/**
 * Rebuilds the per-profile array by walking the configured profile order.
 *
 * Driving the array off `profileNames` rather than off the two maps is a
 * structural defence: `mapParallelSettled` keeps a result only when it is not
 * `undefined`, so a handler that returned nothing would land in neither map and
 * vanish silently. Here a profile missing from both maps becomes a synthetic
 * failure instead, and the output is in configuration order for free.
 */
function indexByProfile(
  profiles: ReadonlyArray<string>,
  results: ReadonlyMap<string, ScheduleRead>,
  errors: ReadonlyMap<string, Error>,
): ReadonlyArray<ScheduleRead> {
  return profiles.map((profile): ScheduleRead => {
    const read = results.get(profile);
    if (read !== undefined) {
      return read;
    }

    return {
      profile,
      accountId: undefined,
      schedule: undefined,
      status: 'error',
      error: errors.get(profile) ?? new Error(`Profile "${profile}" produced no result`),
    };
  });
}

/**
 * Reads the configured schedule from all profiles in parallel.
 *
 * The handler catches everything and always returns a `ScheduleRead`, so a
 * single unreachable account never aborts the fan-out. An account id that STS
 * refuses to resolve is reported as `undefined` rather than failing the profile:
 * the schedule was still read.
 *
 * @param script - The GOScript instance providing the AWS clients and the spinners
 * @param config - Validated script configuration, with `scheduleName` already checked
 * @returns One read per configured profile, in configuration order
 */
export async function readSchedules(
  script: Core.GOScript,
  config: AwsScheduleEventbridgeConfig,
): Promise<ReadonlyArray<ScheduleRead>> {
  const scheduleName = config.scheduleName;
  if (scheduleName === undefined) {
    throw new Error('--schedule-name is required to read a schedule');
  }

  const { results, errors } = await script.aws.clients.mapParallelSettled(
    async (profile, clientProvider): Promise<ScheduleRead> => {
      script.prompt.spin(profile, `${profile}: reading "${scheduleName}"...`);

      // A failed identity lookup must not turn a healthy profile into a failure.
      const accountId = await clientProvider.resolveAccountId().catch(() => undefined);
      // Never `script.aws.services.scheduler`: the cached services all talk to
      // the first profile only, so inside the fan-out the client must come from
      // the provider handed to this callback.
      const service = new AWS.AWSSchedulerService(clientProvider.scheduler);

      try {
        const schedule = await service.getSchedule(scheduleName, config.scheduleGroup);
        script.prompt.spinSucceed(profile, `${profile}: ${schedule.State ?? 'UNKNOWN'}`);
        return { profile, accountId, schedule, status: 'found', error: undefined };
      } catch (error: unknown) {
        if (isScheduleNotFound(error)) {
          script.prompt.spinWarn(profile, `${profile}: schedule "${scheduleName}" does not exist`);
          return { profile, accountId, schedule: undefined, status: 'not-found', error: undefined };
        }

        const failure = error instanceof Error ? error : new Error(String(error));
        script.prompt.spinFail(profile, `${profile}: ${failure.message}`);
        return { profile, accountId, schedule: undefined, status: 'error', error: failure };
      }
    },
  );

  return indexByProfile(script.aws.clients.profileNames, results, errors);
}
