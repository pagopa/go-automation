/**
 * Fetches alarm history from AWS CloudWatch using multi-profile mode.
 */

import { Core } from '@go-automation/go-common';

import type { AlarmHistoryItem } from '@aws-sdk/client-cloudwatch';
import type { GoReportAlarmsConfig } from '../types/GoReportAlarmsConfig.js';

import { MultiProfileQueryCoordinator } from './MultiProfileQueryCoordinator.js';
import { displayProfileSummary } from './displayReports.js';

/**
 * Fetch alarm history using multi-profile mode.
 *
 * @param script - GOScript instance for logging and AWS access
 * @param config - Script configuration with profiles and date range
 * @returns Array of alarm history items from all successful profiles
 * @throws If all profile queries fail
 */
export async function fetchAlarms(
  script: Core.GOScript,
  config: GoReportAlarmsConfig,
): Promise<ReadonlyArray<AlarmHistoryItem>> {
  const coordinator = new MultiProfileQueryCoordinator(script.awsMulti);
  const profiles = config.awsProfiles ?? [];

  script.logger.section('Fetching Alarm History (Multi-Profile)');
  script.logger.info(`Profiles: ${profiles.join(', ')}`);
  script.prompt.setSpinnerIndent(4);
  script.prompt.startSpinner('Retrieving alarm history from AWS CloudWatch...');

  const result = await coordinator.queryAllProfiles({
    profiles,
    startDate: config.startDate,
    endDate: config.endDate,
    alarmName: config.alarmName,
    onProgress: (profile, status) => {
      if (status === 'start') {
        script.prompt.updateSpinner(`Querying profile: ${profile}...`);
      }
    },
  });

  script.prompt.spinnerStop(
    `Retrieved ${result.totalItemCount} alarm history items from ${result.successfulProfiles.length} profiles`,
  );

  // Display profile summary
  displayProfileSummary(script, result);

  // Handle case where all profiles failed
  if (result.successfulProfiles.length === 0) {
    throw new Error('All profile queries failed. Cannot continue.');
  }

  // Warn if some profiles failed
  if (!result.allSucceeded) {
    script.logger.warning(
      `Continuing with ${result.successfulProfiles.length} successful profiles. ` +
        `${result.failedProfiles.length} profiles failed.`,
    );
  }

  return result.items;
}
