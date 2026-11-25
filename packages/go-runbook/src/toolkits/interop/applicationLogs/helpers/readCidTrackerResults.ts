import { readCloudWatchResultRows } from '../../../common/parsing/aws/cloudwatch-logs/readCloudWatchResultRows.js';
import type { InteropK8sCidTrackerResult } from '../steps/InteropK8sCidTrackerResult.js';

/**
 * Reads the output of the CID tracker step: the reads with a string CID and valid rows; nothing when the output is
 * not a list.
 *
 * @param value - Output of the CID tracker step
 * @returns The reads of the tracker, or `undefined`
 *
 * @example
 * ```typescript
 * const tracker = readCidTrackerResults(context.stepResults.get('query-interop-cid-tracker'));
 * ```
 */
export function readCidTrackerResults(value: unknown): ReadonlyArray<InteropK8sCidTrackerResult> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || !('cid' in entry) || !('rows' in entry)) return [];
    if (typeof entry.cid !== 'string') return [];
    const rows = readCloudWatchResultRows(entry.rows);
    return rows === undefined ? [] : [{ cid: entry.cid, rows }];
  });
}
