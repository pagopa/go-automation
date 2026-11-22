import type { Runbook } from '../../engine/index.js';
import { computeRunbookTimeRange } from '../../toolkits/common/time/occurrence/computeRunbookTimeRange.js';
import { createTimeRangeReference } from '../../toolkits/common/time/occurrence/createTimeRangeReference.js';
import type { OccurrenceParamsInput } from './OccurrenceParamsInput.js';

/**
 * The parameters of a runbook execution for one alarm occurrence: the alarm, its time, the AWS context and the time
 * range the runbook reads, computed from the occurrence window of the runbook.
 *
 * @param runbook - The runbook to execute, whose occurrence window sets the time range
 * @param occurrence - The alarm, its first and last occurrence, account, region and profiles
 * @returns The parameters, in a stable order; `awsAccountId` and `alarmDatetimeEnd` only when given
 *
 * @example
 * ```typescript
 * const params = buildOccurrenceParams(runbook, {
 *   alarmName: 'pn-delivery-ApiGwAlarm',
 *   alarmDatetime: '2026-11-22T10:00:00.000Z',
 *   awsRegion: 'eu-south-1',
 *   awsProfiles: ['reader'],
 * });
 * params.get('startTime');
 * ```
 */
export function buildOccurrenceParams(
  runbook: Runbook,
  occurrence: OccurrenceParamsInput,
): ReadonlyMap<string, string> {
  const reference = createTimeRangeReference(occurrence.alarmDatetime, occurrence.alarmDatetimeEnd);
  const { startTime, endTime } = computeRunbookTimeRange(runbook, reference);
  const params = new Map<string, string>([
    ['alarmName', occurrence.alarmName],
    ['alarmDatetime', occurrence.alarmDatetime],
    ...(occurrence.awsAccountId === undefined ? [] : [['awsAccountId', occurrence.awsAccountId] as const]),
    ['awsRegion', occurrence.awsRegion],
    ['awsProfiles', occurrence.awsProfiles.join(',')],
    ['startTime', startTime],
    ['endTime', endTime],
  ]);
  if (occurrence.alarmDatetimeEnd !== undefined && occurrence.alarmDatetimeEnd.trim() !== '') {
    params.set('alarmDatetimeEnd', occurrence.alarmDatetimeEnd);
  }
  return params;
}
