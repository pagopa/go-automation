/**
 * AWS Schedule EventBridge - Main Logic Module
 *
 * Operates on Amazon EventBridge Scheduler schedules:
 * - `list`: enumerates the schedules of a group, with optional prefix/state filters.
 * - `describe`: prints every field of a single schedule.
 * - `enable` / `disable`: sweeps one schedule to the requested state across
 *   every configured account, previewing the change per account before a single
 *   confirmation covers the whole batch.
 *
 * Mutations still target one schedule name per invocation — there is no bulk or
 * wildcard mode — but the blast radius is every account in `--aws-profiles`,
 * within one region.
 */

import type { Core } from '@go-automation/go-common';

import { runDescribeSchedule } from './libs/describeSchedule.js';
import { runListSchedules } from './libs/listSchedules.js';
import { runScheduleSweep } from './libs/runScheduleSweep.js';
import type { AwsScheduleEventbridgeConfig } from './types/index.js';

/**
 * Main script execution function.
 *
 * @param script - The GOScript instance
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<AwsScheduleEventbridgeConfig>();

  script.logger.section('AWS Schedule EventBridge');
  script.logger.info(`Profiles: ${config.awsProfiles.join(', ')} | Region: ${config.awsRegion}`);

  // Only `list` works without a target: every other action acts on one schedule.
  if (config.action !== 'list' && config.scheduleName === undefined) {
    throw new Error(`--schedule-name is required for the "${config.action}" action`);
  }

  // The per-profile clients are built and cached by the framework from
  // aws.profiles/aws.region; every action fans out over them itself.
  switch (config.action) {
    case 'list':
      await runListSchedules(script, config);
      break;
    case 'describe':
      await runDescribeSchedule(script, config);
      break;
    case 'enable':
      await runScheduleSweep(script, config, 'ENABLED');
      break;
    case 'disable':
      await runScheduleSweep(script, config, 'DISABLED');
      break;
    default:
      // Unreachable: `action` is narrowed by the config validator.
      throw new Error(`Unsupported action "${String(config.action)}"`);
  }
}
