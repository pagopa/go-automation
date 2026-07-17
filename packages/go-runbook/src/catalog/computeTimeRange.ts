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
 * @param timeWindowMinutes - Padding window in minutes (must be a finite, non-negative number)
 * @returns Start and end timestamps as ISO 8601 strings
 * @throws Error when `timeWindowMinutes` is not a finite non-negative
 *         number, when any of the input timestamps cannot be parsed, or
 *         when a `multi` range is inverted (`last` strictly before
 *         `first`). A degenerate range where `first === last` is
 *         accepted and produces the symmetric
 *         `[first - window, first + window]` span.
 */
export function computeTimeRange(
  reference: TimeRangeReference,
  timeWindowMinutes: number,
): { startTime: string; endTime: string } {
  if (!Number.isFinite(timeWindowMinutes) || timeWindowMinutes < 0) {
    throw new Error(`Invalid timeWindowMinutes: ${String(timeWindowMinutes)}. Expected a finite, non-negative number.`);
  }
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
