/**
 * `enable` / `disable` actions: toggles the state of a single schedule.
 *
 * Blast radius is one schedule per invocation, and every mutation goes through
 * an interactive confirmation unless `--yes` is passed.
 */

import type { AWS, Core } from '@go-automation/go-common';

import type { AwsScheduleEventbridgeConfig } from '../types/index.js';

/**
 * Enables or disables the configured schedule.
 *
 * The current state is read first: when it already matches the requested one
 * the function reports the no-op and returns without touching the schedule.
 *
 * @param script - The GOScript instance providing logger and prompt
 * @param service - Scheduler service taken from `script.aws.services.scheduler`
 * @param config - Validated script configuration, with `scheduleName` already checked
 * @param targetState - State the schedule must end up in
 */
export async function runSetScheduleState(
  script: Core.GOScript,
  service: AWS.AWSSchedulerService,
  config: AwsScheduleEventbridgeConfig,
  targetState: AWS.ScheduleState,
): Promise<void> {
  const scheduleName = config.scheduleName;
  if (scheduleName === undefined) {
    throw new Error(`--schedule-name is required to set a schedule to ${targetState}`);
  }

  const current = await service.getSchedule(scheduleName, config.scheduleGroup);

  if (current.State === targetState) {
    script.logger.info(`Schedule "${scheduleName}" is already ${targetState}. Nothing to do.`);
    return;
  }

  script.logger.keyValueTable({
    Name: scheduleName,
    Group: config.scheduleGroup,
    Region: config.awsRegion,
    'Current State': current.State ?? '-',
    'Target State': targetState,
  });

  if (!config.yes) {
    // `confirm` resolves to undefined when the prompt is cancelled (e.g. Ctrl+C),
    // which must be treated as a refusal just like an explicit "no".
    const confirmed = await script.prompt.confirm(`Set schedule "${scheduleName}" to ${targetState}?`, false);

    if (confirmed !== true) {
      script.logger.warning('Operation cancelled by user.');
      return;
    }
  }

  const result = await service.setScheduleState(scheduleName, targetState, config.scheduleGroup);

  if (result.unchanged) {
    script.logger.info(`Schedule "${scheduleName}" was already ${result.currentState}. No update issued.`);
    return;
  }

  script.logger.success(
    `Schedule "${scheduleName}" moved from ${result.previousState ?? 'UNKNOWN'} to ${result.currentState}.`,
  );
  if (result.scheduleArn !== undefined) {
    script.logger.info(`ARN: ${result.scheduleArn}`);
  }
}
