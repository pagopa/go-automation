/**
 * Table rendering for schedules.
 *
 * Output is stdout-only: the script never writes to disk, so there is no
 * exporter involved.
 */

import type { AWS, Core } from '@go-automation/go-common';

import type { ScheduleRead } from '../types/index.js';

/**
 * Columns of the `list` table.
 *
 * `Profile` leads, and the other widths were rebalanced to pay for it rather
 * than appended to: the total stays around 150 characters, as before.
 */
const LIST_COLUMNS: ReadonlyArray<Core.GOTableColumn> = [
  { header: 'Profile', key: 'profile', width: 24 },
  { header: 'Name', key: 'name', width: 36 },
  { header: 'Group', key: 'group', width: 14 },
  { header: 'State', key: 'state', width: 10 },
  { header: 'Target ARN', key: 'targetArn', width: 44 },
  { header: 'Last Modified', key: 'lastModified', width: 22 },
];

/** Columns of the drift table: only the fields that actually diverge between accounts */
const DRIFT_COLUMNS: ReadonlyArray<Core.GOTableColumn> = [
  { header: 'Profile', key: 'profile', width: 24 },
  { header: 'Account', key: 'accountId', width: 14 },
  { header: 'State', key: 'state', width: 10 },
  { header: 'Schedule Expression', key: 'expression', width: 26 },
  { header: 'Timezone', key: 'timezone', width: 18 },
  { header: 'Target ARN', key: 'targetArn', width: 44 },
];

/** Renders a date as a sortable UTC timestamp, or a dash when absent */
function formatDate(value: Date | undefined): string {
  return value === undefined ? '-' : value.toISOString();
}

/**
 * Prints the summaries returned by `listSchedules`, from every account, as a
 * single table keyed by profile.
 *
 * Takes the map `mapParallelSettled` already returns rather than an invented
 * pair type: its insertion order is the configuration order, so the rows come
 * out grouped by account with no sorting of our own.
 *
 * @param script - The GOScript instance providing the logger
 * @param byProfile - Schedule summaries per profile, in configuration order
 */
export function displayScheduleTable(
  script: Core.GOScript,
  byProfile: ReadonlyMap<string, ReadonlyArray<AWS.ScheduleSummary>>,
): void {
  const data = Array.from(byProfile).flatMap(([profile, summaries]) =>
    summaries.map((summary) => ({
      profile,
      name: summary.Name ?? '-',
      group: summary.GroupName ?? '-',
      state: summary.State ?? '-',
      targetArn: summary.Target?.Arn ?? '-',
      lastModified: formatDate(summary.LastModificationDate),
    })),
  );

  script.logger.table({ columns: [...LIST_COLUMNS], data });
}

/**
 * Prints one narrow row per account, to make divergence between them visible.
 *
 * Only the fields that realistically drift are shown. A transposed field-by
 * field matrix was considered and dropped: it needs dynamic column generation
 * and degrades past three or four accounts.
 *
 * @param script - The GOScript instance providing the logger
 * @param reads - One read per configured profile, in configuration order
 */
export function displayScheduleDrift(script: Core.GOScript, reads: ReadonlyArray<ScheduleRead>): void {
  const data = reads.map((read) => ({
    profile: read.profile,
    accountId: read.accountId ?? '-',
    state: read.schedule?.State ?? (read.status === 'not-found' ? 'MISSING' : 'ERROR'),
    expression: read.schedule?.ScheduleExpression ?? '-',
    timezone: read.schedule?.ScheduleExpressionTimezone ?? '-',
    targetArn: read.schedule?.Target?.Arn ?? '-',
  }));

  script.logger.section('Cross-account comparison');
  script.logger.table({ columns: [...DRIFT_COLUMNS], data });
}

/**
 * Prints the full detail of a single schedule as a key-value table.
 *
 * @param script - The GOScript instance providing the logger
 * @param schedule - Schedule as returned by `getSchedule`
 */
export function displayScheduleDetail(script: Core.GOScript, schedule: AWS.GetScheduleCommandOutput): void {
  script.logger.keyValueTable({
    Name: schedule.Name ?? '-',
    Group: schedule.GroupName ?? '-',
    State: schedule.State ?? '-',
    ARN: schedule.Arn ?? '-',
    Description: schedule.Description ?? '-',
    'Schedule Expression': schedule.ScheduleExpression ?? '-',
    Timezone: schedule.ScheduleExpressionTimezone ?? '-',
    'Start Date': formatDate(schedule.StartDate),
    'End Date': formatDate(schedule.EndDate),
    'Flexible Time Window': schedule.FlexibleTimeWindow?.Mode ?? '-',
    'Max Window (minutes)': schedule.FlexibleTimeWindow?.MaximumWindowInMinutes ?? '-',
    'Target ARN': schedule.Target?.Arn ?? '-',
    'Target Role ARN': schedule.Target?.RoleArn ?? '-',
    'Target DLQ ARN': schedule.Target?.DeadLetterConfig?.Arn ?? '-',
    'Retry Max Attempts': schedule.Target?.RetryPolicy?.MaximumRetryAttempts ?? '-',
    'Retry Max Event Age': schedule.Target?.RetryPolicy?.MaximumEventAgeInSeconds ?? '-',
    'Action After Completion': schedule.ActionAfterCompletion ?? '-',
    'KMS Key ARN': schedule.KmsKeyArn ?? '-',
    'Creation Date': formatDate(schedule.CreationDate),
    'Last Modification Date': formatDate(schedule.LastModificationDate),
  });
}
