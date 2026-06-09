import type { OutputFormat } from '../report/writeReport.js';

/** Maps the `output.format` config value to the set of artifacts to write. */
export function resolveFormats(outputFormat?: string): ReadonlyArray<OutputFormat> {
  const value = (outputFormat ?? 'all').toLowerCase();
  if (value === 'json') return ['json'];
  if (value === 'html') return ['html'];
  return ['json', 'html'];
}

/** Caps a list to `limit` items when a positive limit is given. */
export function applyLimit<T>(items: ReadonlyArray<T>, limit?: number): ReadonlyArray<T> {
  return limit !== undefined && limit > 0 ? items.slice(0, limit) : items;
}

/** Builds the alarm-events query, omitting empty environment / date bounds. */
export function alarmEventsQuery(
  alarmId: string,
  environmentId: string | undefined,
  dateFrom: string,
  dateTo: string,
): { alarmId: string; environmentId?: string; dateFrom?: string; dateTo?: string } {
  return {
    alarmId,
    ...(environmentId !== undefined ? { environmentId } : {}),
    ...(dateFrom.trim() !== '' ? { dateFrom } : {}),
    ...(dateTo.trim() !== '' ? { dateTo } : {}),
  };
}
