import { trimToUndefined } from '@go-automation/go-common/core';
import { Core } from '@go-automation/go-common';

import type { InteropAlarmOccurrence } from '../types/index.js';

interface FindInteropAlarmOccurrencesConfig {
  readonly alarmName?: string;
  readonly startDate: string;
  readonly endDate: string;
}

export async function findInteropAlarmOccurrences(
  script: Core.GOScript,
  config: FindInteropAlarmOccurrencesConfig,
): Promise<ReadonlyArray<InteropAlarmOccurrence>> {
  const start = parseDate(config.startDate, 'startDate');
  const end = parseDate(config.endDate, 'endDate');
  const alarmName = trimToUndefined(config.alarmName);

  const items = await script.aws.services.cloudWatchAlarms.describeAlarmStateTransitions({
    timeRange: { start, end },
    scanBy: 'TimestampAscending',
    ...(alarmName === undefined ? {} : { alarmName }),
  });

  const occurrences: InteropAlarmOccurrence[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const currentAlarmName = trimToUndefined(item.AlarmName);
    const timestamp = item.Timestamp?.toISOString();
    if (currentAlarmName === undefined || timestamp === undefined) continue;

    const key = `${currentAlarmName}\u0000${timestamp}`;
    if (seen.has(key)) continue;

    seen.add(key);
    occurrences.push({ alarmName: currentAlarmName, alarmTimestamp: timestamp });
  }

  return occurrences.sort((a, b) => {
    const timestampOrder = a.alarmTimestamp.localeCompare(b.alarmTimestamp);
    return timestampOrder === 0 ? a.alarmName.localeCompare(b.alarmName) : timestampOrder;
  });
}

function parseDate(value: string, label: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${label}: "${value}". Expected ISO 8601 format.`);
  }
  return parsed;
}
