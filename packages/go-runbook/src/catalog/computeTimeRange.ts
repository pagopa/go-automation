/**
 * Utility for computing alarm time ranges.
 */

import type { TimeRangeReference } from './TimeRangeReference.js';
import type { OccurrenceTimeWindow } from '../types/OccurrenceTimeWindow.js';

/**
 * Computes the analysis window for an alarm.
 *
 * - For a `single` reference the window is padded independently around `at`:
 *   `[at - beforeMinutes, at + afterMinutes]`.
 * - For a `multi` reference the window stretches from the first to the
 *   last occurrence, with independent padding on each side:
 *   `[first - beforeMinutes, last + afterMinutes]`.
 *
 * @param reference - Reference point(s) for the window
 * @param timeWindow - Independent padding, or a number for the legacy symmetric form
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
  timeWindow: number | OccurrenceTimeWindow,
): { startTime: string; endTime: string } {
  const { beforeMinutes, afterMinutes } = normalizeTimeWindow(timeWindow);
  const beforeOffsetMs = beforeMinutes * 60 * 1000;
  const afterOffsetMs = afterMinutes * 60 * 1000;

  if (reference.kind === 'single') {
    const at = parseIso(reference.at, 'alarmDatetime');
    return {
      startTime: new Date(at.getTime() - beforeOffsetMs).toISOString(),
      endTime: new Date(at.getTime() + afterOffsetMs).toISOString(),
    };
  }

  const first = parseIso(reference.first, 'alarmDatetime (first occurrence)');
  const last = parseIso(reference.last, 'alarmDatetime (last occurrence)');

  if (last.getTime() < first.getTime()) {
    throw new Error(`Invalid alarm datetime range: last (${reference.last}) is before first (${reference.first}).`);
  }

  return {
    startTime: new Date(first.getTime() - beforeOffsetMs).toISOString(),
    endTime: new Date(last.getTime() + afterOffsetMs).toISOString(),
  };
}

function normalizeTimeWindow(timeWindow: number | OccurrenceTimeWindow): OccurrenceTimeWindow {
  if (typeof timeWindow === 'number') {
    assertValidMinutes(timeWindow, 'timeWindowMinutes');
    return { beforeMinutes: timeWindow, afterMinutes: timeWindow };
  }

  assertValidMinutes(timeWindow.beforeMinutes, 'timeWindow.beforeMinutes');
  assertValidMinutes(timeWindow.afterMinutes, 'timeWindow.afterMinutes');
  return timeWindow;
}

function assertValidMinutes(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid ${label}: ${String(value)}. Expected a finite, non-negative number.`);
  }
}

function parseIso(value: string, label: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${label}: "${value}". Expected ISO 8601 format.`);
  }
  return parsed;
}
