import { Core } from '@go-automation/go-common';

import type { AnalyzableAlarmConfig } from '../types/AnalyzableAlarmConfig.js';

export interface FindAlarmOccurrencesConfig {
  readonly alarmName: string;
  readonly alarmDatetime: string;
  readonly alarmDatetimeEnd: string;
}

export async function findAlarmOccurrences(
  script: Core.GOScript,
  config: FindAlarmOccurrencesConfig,
): Promise<ReadonlyArray<string>> {
  const start = parseDate(config.alarmDatetime, 'alarm.datetime');
  const end = parseDate(config.alarmDatetimeEnd, 'alarm.datetime.end');

  const items = await script.aws.services.cloudWatchAlarms.describeAlarmStateTransitions({
    alarmName: config.alarmName,
    timeRange: { start, end },
    scanBy: 'TimestampAscending',
  });

  const timestamps = items.flatMap((item) => (item.Timestamp === undefined ? [] : [item.Timestamp.toISOString()]));
  return [...new Set(timestamps)].sort();
}

/**
 * Asserts that the configuration is a valid range-mode configuration.
 * Must be called only on the range path: calling it in single mode throws,
 * which keeps the type assertion sound (no narrowing without validation).
 *
 * @param config - Script configuration to validate
 */
export function assertRangeModeConfig(config: AnalyzableAlarmConfig): asserts config is AnalyzableAlarmConfig & {
  readonly analysisMode: 'range';
  readonly alarmDatetimeEnd: string;
} {
  if (config.analysisMode !== 'range') {
    throw new Error(`assertRangeModeConfig called with analysis.mode=${config.analysisMode}`);
  }
  if (config.alarmDatetimeEnd === undefined || config.alarmDatetimeEnd.trim() === '') {
    throw new Error('alarm.datetime.end is required when analysis.mode=range');
  }
}

function parseDate(value: string, label: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${label}: "${value}". Expected ISO 8601 format.`);
  }
  return parsed;
}
