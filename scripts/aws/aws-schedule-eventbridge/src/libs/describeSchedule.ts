/**
 * `describe` action: prints the full detail of a single schedule.
 */

import type { AWS, Core } from '@go-automation/go-common';

import type { AwsScheduleEventbridgeConfig } from '../types/index.js';
import { displayScheduleDetail } from './scheduleDisplay.js';

/**
 * Fetches a schedule and renders every field as a key-value table.
 *
 * @param script - The GOScript instance providing logger and prompt
 * @param service - Scheduler service taken from `script.aws.services.scheduler`
 * @param config - Validated script configuration, with `scheduleName` already checked
 */
export async function runDescribeSchedule(
  script: Core.GOScript,
  service: AWS.AWSSchedulerService,
  config: AwsScheduleEventbridgeConfig,
): Promise<void> {
  const scheduleName = config.scheduleName;
  if (scheduleName === undefined) {
    throw new Error('--schedule-name is required for the describe action');
  }

  script.logger.info(`Describing schedule "${scheduleName}" in group "${config.scheduleGroup}"`);

  const schedule = await service.getSchedule(scheduleName, config.scheduleGroup);

  displayScheduleDetail(script, schedule);
}
