/**
 * AWS Schedule EventBridge - Main Logic Module
 *
 * Operates on Amazon EventBridge Scheduler schedules:
 * - `list`: enumerates the schedules of a group, with optional prefix/state filters.
 * - `describe`: prints every field of a single schedule.
 * - `enable` / `disable`: toggles the state of a single schedule, behind an
 *   interactive confirmation.
 *
 * Mutations target one schedule per invocation: there is no bulk or wildcard
 * mode, by design.
 */

import type { Core } from '@go-automation/go-common';

import { runDescribeSchedule } from './libs/describeSchedule.js';
import { runListSchedules } from './libs/listSchedules.js';
import { runSetScheduleState } from './libs/setScheduleState.js';
import type { AwsScheduleEventbridgeConfig } from './types/index.js';

/**
 * Main script execution function.
 *
 * @param script - The GOScript instance
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<AwsScheduleEventbridgeConfig>();

  script.logger.section('AWS Schedule EventBridge');

  // Only `list` works without a target: every other action acts on one schedule.
  if (config.action !== 'list' && config.scheduleName === undefined) {
    throw new Error(`--schedule-name is required for the "${config.action}" action`);
  }

  // Client and service are built and cached by the framework from aws.profile/aws.region.
  const service = script.aws.services.scheduler;

  switch (config.action) {
    case 'list':
      await runListSchedules(script, service, config);
      break;
    case 'describe':
      await runDescribeSchedule(script, service, config);
      break;
    case 'enable':
      await runSetScheduleState(script, service, config, 'ENABLED');
      break;
    case 'disable':
      await runSetScheduleState(script, service, config, 'DISABLED');
      break;
    default:
      // Unreachable: `action` is narrowed by the config validator.
      throw new Error(`Unsupported action "${String(config.action)}"`);
  }
}
