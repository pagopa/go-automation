/**
 * Fetches alarm history from AWS CloudWatch using multi-profile mode.
 */

import { AWS, Core } from '@go-automation/go-common';

import type { GoReportAlarmsConfig } from '../types/GoReportAlarmsConfig.js';
import type { MultiProfileQueryResult } from '../types/MultiProfileQueryResult.js';
import type { ProfileQueryFailure, ProfileQuerySuccess } from '../types/ProfileQueryResult.js';

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
): Promise<ReadonlyArray<AWS.AlarmHistoryItem>> {
  const profiles = script.aws.clients.profileNames;

  script.logger.section('Fetching Alarm History (Multi-Profile)');
  script.logger.info(`Profiles: ${profiles.join(', ')}`);
  script.prompt.setSpinnerIndent(4);
  script.prompt.startSpinner('Retrieving alarm history from AWS CloudWatch...');

  const queryResult = await script.aws.clients.mapParallelSettled(async (profile, clients) => {
    script.prompt.updateSpinner(`Querying profile: ${profile}...`);
    const service = new AWS.AWSCloudWatchAlarmsService(clients.cloudWatch);
    return await service.describeAlarmHistory({
      timeRange: { start: new Date(config.startDate), end: new Date(config.endDate) },
      historyItemType: 'Action',
      ...(config.alarmName === undefined ? {} : { alarmName: config.alarmName }),
    });
  });
  const result = aggregateProfileResults(queryResult.results, queryResult.errors, profiles.length);

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

function aggregateProfileResults(
  results: ReadonlyMap<string, ReadonlyArray<AWS.AlarmHistoryItem>>,
  errors: ReadonlyMap<string, Error>,
  profileCount: number,
): MultiProfileQueryResult {
  const successfulProfiles: ProfileQuerySuccess[] = Array.from(results, ([profile, items]) => ({
    status: 'success',
    profile,
    items,
    itemCount: items.length,
  }));
  const failedProfiles: ProfileQueryFailure[] = Array.from(errors, ([profile, error]) => ({
    status: 'failure',
    profile,
    error,
  }));
  const items = deduplicateAlarmItems(successfulProfiles.flatMap((result) => result.items));

  return {
    items,
    totalItemCount: items.length,
    successfulProfiles,
    failedProfiles,
    allSucceeded: failedProfiles.length === 0,
    profileCount,
  };
}

function deduplicateAlarmItems(items: ReadonlyArray<AWS.AlarmHistoryItem>): ReadonlyArray<AWS.AlarmHistoryItem> {
  const uniqueItems = new Map<string, AWS.AlarmHistoryItem>();

  for (const item of items) {
    const key = [item.AlarmName ?? '', item.Timestamp?.toISOString() ?? '', item.HistoryItemType ?? ''].join('|');
    if (!uniqueItems.has(key)) uniqueItems.set(key, item);
  }

  return Array.from(uniqueItems.values());
}
