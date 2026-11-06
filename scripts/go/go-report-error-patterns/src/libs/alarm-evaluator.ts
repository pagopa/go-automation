import type { AlarmHistoryItem } from '@go-automation/go-common/aws';
import type { AlarmOccurrence } from '../types/PatternTypes.js';

interface RawHistoryData {
  readonly version?: string;
  readonly oldState?: { readonly stateValue?: string };
  readonly newState?: { readonly stateValue?: string };
  readonly trigger?: {
    readonly period?: number;
    readonly evaluationPeriods?: number;
    readonly datapointsToAlarm?: number;
    readonly evaluatingDatapoints?: ReadonlyArray<{
      readonly timestamp?: string;
      readonly value?: number;
    }>;
  };
  readonly evaluatingDatapoints?: ReadonlyArray<{
    readonly timestamp?: string;
    readonly value?: number;
  }>;
}

/**
 * Parses an ISO string, timestamp number or date into a valid Date object.
 */
export function parseDateInput(value: string | number | Date): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`Invalid Date object provided: ${value.toString()}`);
    }
    return value;
  }

  if (typeof value === 'number') {
    // If value is seconds (10 digits), convert to ms
    const ms = value < 100_000_000_000 ? value * 1000 : value;
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid numeric timestamp provided: ${value}`);
    }
    return date;
  }

  const numeric = Number(value);
  if (!Number.isNaN(numeric) && value.trim() !== '') {
    return parseDateInput(numeric);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date string format: "${value}"`);
  }
  return date;
}

/**
 * Extracts evaluating datapoints and calculates optimal query time range
 * for an alarm state transition to ALARM.
 *
 * @param item - The alarm history item containing transition data
 * @param timeWindowExtraSeconds - Extra seconds to pad before and after the calculated query window
 */
export function extractAlarmOccurrenceWindow(
  item: AlarmHistoryItem,
  timeWindowExtraSeconds = 0,
): AlarmOccurrence | undefined {
  if (!item.HistoryData) {
    return undefined;
  }

  let parsed: RawHistoryData;
  try {
    parsed = JSON.parse(item.HistoryData) as RawHistoryData;
  } catch {
    return undefined;
  }

  const itemTimestamp = item.Timestamp ?? new Date();
  const rawDatapoints = parsed.trigger?.evaluatingDatapoints ?? parsed.evaluatingDatapoints ?? [];
  const datapointTimestamps: Date[] = [];

  for (const dp of rawDatapoints) {
    if (dp.timestamp) {
      try {
        const d = parseDateInput(dp.timestamp);
        datapointTimestamps.push(d);
      } catch {
        // ignore malformed timestamp
      }
    }
  }

  const periodSeconds = parsed.trigger?.period ?? 60;
  const paddingMs = Math.max(timeWindowExtraSeconds, 0) * 1000;

  let queryStartTime: Date;
  let queryEndTime: Date;

  const firstDp = datapointTimestamps[0];
  const lastDp = datapointTimestamps[datapointTimestamps.length - 1];

  if (firstDp !== undefined && lastDp !== undefined) {
    // Sort ascending
    datapointTimestamps.sort((a, b) => a.getTime() - b.getTime());
    const minTimestamp = datapointTimestamps[0]?.getTime() ?? firstDp.getTime();
    const maxTimestamp = datapointTimestamps[datapointTimestamps.length - 1]?.getTime() ?? lastDp.getTime();

    // Query range covers the datapoints window, minus one period before minTimestamp
    // and up to the end of the last period + user extra seconds
    queryStartTime = new Date(minTimestamp - periodSeconds * 1000 - paddingMs);
    queryEndTime = new Date(maxTimestamp + paddingMs);
  } else {
    // Fallback if evaluatingDatapoints is empty
    const evalPeriods = parsed.trigger?.evaluationPeriods ?? 1;
    const durationMs = evalPeriods * periodSeconds * 1000;
    queryStartTime = new Date(itemTimestamp.getTime() - durationMs - paddingMs);
    queryEndTime = new Date(itemTimestamp.getTime() + paddingMs);
  }

  return {
    timestamp: itemTimestamp,
    historySummary: item.HistorySummary,
    queryStartTime,
    queryEndTime,
    evaluatingDatapointTimestamps: datapointTimestamps,
  };
}
