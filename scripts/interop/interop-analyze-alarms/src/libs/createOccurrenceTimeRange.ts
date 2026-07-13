import type { AWSCloudWatchLogsTimeRange } from '@go-automation/go-common/aws';

export function createOccurrenceTimeRange(
  timestamp: string,
  deltaStartSeconds: number,
  deltaEndSeconds: number,
): AWSCloudWatchLogsTimeRange {
  const isoTimestamp = new Date(timestamp).getTime();
  if (Number.isNaN(isoTimestamp)) {
    throw new Error(`Invalid alarm timestamp: "${timestamp}". Expected ISO 8601 format.`);
  }

  return {
    start: new Date(isoTimestamp - deltaStartSeconds * 1000),
    end: new Date(isoTimestamp + deltaEndSeconds * 1000),
  };
}
