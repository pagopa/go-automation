/**
 * `list` action: enumerates the schedules matching the CLI filters.
 */

import { Core } from '@go-automation/go-common';
import type { AWS } from '@go-automation/go-common';

import type { AwsScheduleEventbridgeConfig } from '../types/index.js';
import { displayScheduleTable } from './scheduleDisplay.js';

/**
 * Lists the schedules of a group, optionally filtered by name prefix and state.
 *
 * @param script - The GOScript instance providing logger and prompt
 * @param service - Scheduler service taken from `script.aws.services.scheduler`
 * @param config - Validated script configuration
 */
export async function runListSchedules(
  script: Core.GOScript,
  service: AWS.AWSSchedulerService,
  config: AwsScheduleEventbridgeConfig,
): Promise<void> {
  const filters = Core.omitUndefined({
    groupName: config.scheduleGroup,
    namePrefix: config.namePrefix,
    state: config.state,
  });

  script.logger.info(`Listing schedules in group "${config.scheduleGroup}" (region ${config.awsRegion})`);

  const summaries = await service.listSchedules(filters);

  if (summaries.length === 0) {
    script.logger.info('No schedules match the given filters.');
    return;
  }

  displayScheduleTable(script, summaries);
  script.logger.success(`Found ${summaries.length} schedule(s).`);
}
