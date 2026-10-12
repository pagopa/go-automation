/**
 * `list` action: enumerates the schedules matching the CLI filters, in every
 * configured account.
 */

import { AWS, Core } from '@go-automation/go-common';

import type { AwsScheduleEventbridgeConfig } from '../types/index.js';
import { displayScheduleTable } from './scheduleDisplay.js';

/** Reports what each account contributed, so a quiet account is visible. */
function reportPerProfile(
  script: Core.GOScript,
  profiles: ReadonlyArray<string>,
  results: ReadonlyMap<string, ReadonlyArray<AWS.ScheduleSummary>>,
  errors: ReadonlyMap<string, Error>,
): void {
  for (const profile of profiles) {
    const summaries = results.get(profile);

    if (summaries === undefined) {
      script.logger.error(`${profile}: ${errors.get(profile)?.message ?? 'produced no result'}`);
    } else if (summaries.length === 0) {
      script.logger.warning(`${profile}: no schedule matches the given filters.`);
    } else {
      script.logger.info(`${profile}: ${summaries.length} schedule(s).`);
    }
  }
}

/**
 * Lists the schedules of a group across all profiles, optionally filtered by
 * name prefix and state.
 *
 * Read-only, so the failure policy is the lenient one: a partial failure is
 * reported per profile and the run still succeeds. Only an entirely failed
 * fleet throws, which matches `aws-check-ecs`.
 *
 * @param script - The GOScript instance providing the AWS clients and the logger
 * @param config - Validated script configuration
 * @throws When every profile failed
 */
export async function runListSchedules(script: Core.GOScript, config: AwsScheduleEventbridgeConfig): Promise<void> {
  const filters = Core.omitUndefined({
    groupName: config.scheduleGroup,
    namePrefix: config.namePrefix,
    state: config.state,
  });

  script.logger.info(`Listing schedules in group "${config.scheduleGroup}" (region ${config.awsRegion})`);

  const { results, errors } = await script.aws.clients.mapParallelSettled(
    async (profile, clientProvider): Promise<ReadonlyArray<AWS.ScheduleSummary>> => {
      script.prompt.spin(profile, `${profile}: listing schedules...`);

      // Never `script.aws.services.scheduler`: it only ever talks to the first profile.
      const service = new AWS.AWSSchedulerService(clientProvider.scheduler);
      const summaries = await service.listSchedules(filters);

      script.prompt.spinSucceed(profile, `${profile}: ${summaries.length} schedule(s)`);
      return summaries;
    },
  );

  for (const [profile, error] of errors) {
    script.prompt.spinFail(profile, `${profile}: ${error.message}`);
  }

  const profiles = script.aws.clients.profileNames;
  const total = Array.from(results.values()).reduce((sum, summaries) => sum + summaries.length, 0);

  if (total > 0) {
    displayScheduleTable(script, results);
  }

  reportPerProfile(script, profiles, results, errors);

  if (results.size === 0 && errors.size > 0) {
    throw new Error('All profiles failed. Check AWS credentials and profile names.');
  }

  if (total === 0) {
    script.logger.info('No schedule matches the given filters in any account.');
    return;
  }

  script.logger.success(`Found ${total} schedule(s) across ${results.size} of ${profiles.length} account(s).`);
}
