/**
 * Table rendering for schedules.
 *
 * Output is stdout-only: the script never writes to disk, so there is no
 * exporter involved.
 */

import type { AWS, Core } from '@go-automation/go-common';

/** Columns of the `list` table */
const LIST_COLUMNS: ReadonlyArray<Core.GOTableColumn> = [
  { header: 'Name', key: 'name', width: 42 },
  { header: 'Group', key: 'group', width: 18 },
  { header: 'State', key: 'state', width: 10 },
  { header: 'Target ARN', key: 'targetArn', width: 60 },
  { header: 'Last Modified', key: 'lastModified', width: 22 },
];

/** Renders a date as a sortable UTC timestamp, or a dash when absent */
function formatDate(value: Date | undefined): string {
  return value === undefined ? '-' : value.toISOString();
}

/**
 * Prints the summaries returned by `listSchedules` as a table.
 *
 * @param script - The GOScript instance providing the logger
 * @param summaries - Schedule summaries to render
 */
export function displayScheduleTable(script: Core.GOScript, summaries: ReadonlyArray<AWS.ScheduleSummary>): void {
  const data = summaries.map((summary) => ({
    name: summary.Name ?? '-',
    group: summary.GroupName ?? '-',
    state: summary.State ?? '-',
    targetArn: summary.Target?.Arn ?? '-',
    lastModified: formatDate(summary.LastModificationDate),
  }));

  script.logger.table({ columns: [...LIST_COLUMNS], data });
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
