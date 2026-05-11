/**
 * Utility for computing alarm time ranges.
 */

import type { TimeRangeReference } from './TimeRangeReference.js';

/**
 * Computes the analysis window for an alarm.
 *
 * - For a `single` reference the window is symmetric around `at`:
 *   `[at - windowMinutes, at + windowMinutes]`.
 * - For a `multi` reference the window stretches from the first to the
 *   last occurrence, padded by `windowMinutes` on each side:
 *   `[first - windowMinutes, last + windowMinutes]`.
 *
 * @param reference - Reference point(s) for the window
 * @param timeWindowMinutes - Padding window in minutes (must be ≥ 0)
 * @returns Start and end timestamps as ISO 8601 strings
 * @throws Error when any of the input timestamps cannot be parsed or
 *         when the `multi` range collapses to a non-positive duration
 */
export function computeTimeRange(
  reference: TimeRangeReference,
  timeWindowMinutes: number,
): { startTime: string; endTime: string } {
  const offsetMs = timeWindowMinutes * 60 * 1000;

  if (reference.kind === 'single') {
    const at = parseIso(reference.at, 'alarmDatetime');
    return {
      startTime: new Date(at.getTime() - offsetMs).toISOString(),
      endTime: new Date(at.getTime() + offsetMs).toISOString(),
    };
  }

  const first = parseIso(reference.first, 'alarmDatetime (first occurrence)');
  const last = parseIso(reference.last, 'alarmDatetime (last occurrence)');

  if (last.getTime() < first.getTime()) {
    throw new Error(`Invalid alarm datetime range: last (${reference.last}) is before first (${reference.first}).`);
  }

  return {
    startTime: new Date(first.getTime() - offsetMs).toISOString(),
    endTime: new Date(last.getTime() + offsetMs).toISOString(),
  };
}

function parseIso(value: string, label: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${label}: "${value}". Expected ISO 8601 format.`);
  }
  return parsed;
}
