/**
 * `describe` action: prints the full detail of a schedule, per account.
 */

import type { Core } from '@go-automation/go-common';

import type { AwsScheduleEventbridgeConfig, ScheduleRead } from '../types/index.js';
import { readSchedules } from './readSchedules.js';
import { displayScheduleDetail, displayScheduleDrift } from './scheduleDisplay.js';

/** Prints one account's block: the detail when it has the schedule, why not otherwise. */
function reportRead(script: Core.GOScript, read: ScheduleRead, scheduleName: string): void {
  const account = read.accountId === undefined ? '' : ` (${read.accountId})`;
  script.logger.section(`Profile: ${read.profile}${account}`);

  if (read.schedule !== undefined) {
    displayScheduleDetail(script, read.schedule);
    return;
  }

  if (read.status === 'not-found') {
    script.logger.warning(`Schedule "${scheduleName}" does not exist in this account.`);
    return;
  }

  script.logger.error(`Read failed: ${read.error?.message ?? 'unknown error'}`);
}

/**
 * Fetches a schedule from every configured account and renders each one in full.
 *
 * Reuses the sweep's read phase verbatim — the fan-out is identical — and adds
 * the cross-account comparison, which only earns its place with more than one
 * account configured.
 *
 * @param script - The GOScript instance providing the AWS clients and the logger
 * @param config - Validated script configuration, with `scheduleName` already checked
 * @throws When every profile failed, or an account is missing the schedule under `--fail-on-missing`
 */
export async function runDescribeSchedule(script: Core.GOScript, config: AwsScheduleEventbridgeConfig): Promise<void> {
  const scheduleName = config.scheduleName;
  if (scheduleName === undefined) {
    throw new Error('--schedule-name is required for the describe action');
  }

  const reads = await readSchedules(script, config);

  for (const read of reads) {
    reportRead(script, read, scheduleName);
  }

  if (reads.length > 1) {
    displayScheduleDrift(script, reads);
  }

  const failed = reads.filter((read) => read.status === 'error').length;
  const missing = reads.filter((read) => read.status === 'not-found').length;

  if (failed === reads.length && reads.length > 0) {
    throw new Error('All profiles failed. Check AWS credentials and profile names.');
  }

  if (config.failOnMissing && missing > 0) {
    throw new Error(`Schedule "${scheduleName}" is missing in ${missing} of ${reads.length} account(s).`);
  }
}
