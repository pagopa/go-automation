/**
 * Utility for computing alarm time ranges.
 */

/**
 * Computes the time range from the alarm datetime string.
 * Returns start/end ISO strings with +/-timeWindowMinutes.
 *
 * @param alarmDatetime - ISO 8601 timestamp of the alarm
 * @param timeWindowMinutes - Time window in minutes
 * @returns Start and end ISO strings
 */
export function computeTimeRange(
  alarmDatetime: string,
  timeWindowMinutes: number,
): { startTime: string; endTime: string } {
  const alarmTime = new Date(alarmDatetime);
  if (Number.isNaN(alarmTime.getTime())) {
    throw new Error(`Invalid alarm datetime: "${alarmDatetime}". Expected ISO 8601 format.`);
  }

  const offsetMs = timeWindowMinutes * 60 * 1000;
  const start = new Date(alarmTime.getTime() - offsetMs);
  const end = new Date(alarmTime.getTime() + offsetMs);

  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}
