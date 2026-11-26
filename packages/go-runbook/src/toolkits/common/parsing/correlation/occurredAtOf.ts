import { readEvidenceTime } from '../aws/cloudwatch-logs/readEvidenceTime.js';

/**
 * The ISO time of the earliest of some log rows.
 *
 * @param rows - Logs Insights rows
 * @returns The ISO time, or nothing when no row has one
 *
 * @example
 * ```typescript
 * occurredAtOf([[{ field: '@timestamp', value: '2026-11-20 10:00:00.000' }]]); // '2026-11-20T10:00:00.000Z'
 * ```
 */
export function occurredAtOf(rows: ReadonlyArray<unknown>): string | undefined {
  let earliest: number | undefined;
  for (const row of rows) {
    const first = readEvidenceTime(row)?.first;
    if (first !== undefined && (earliest === undefined || first < earliest)) earliest = first;
  }
  return earliest === undefined ? undefined : new Date(earliest).toISOString();
}
