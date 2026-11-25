import { type GOLogsInsightsResultField, readRowFields } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { trimToUndefined } from '@pagopa/go-common/utils';

const CID_PATTERN = /\bCID=([^\]\s,"']+)/u;

/** Field names that may carry the correlation id explicitly. */
const CID_FIELDS: ReadonlyArray<string> = ['cid', 'CID'];

/** Field names whose text may embed a `CID=...` token. */
const MESSAGE_FIELDS: ReadonlyArray<string> = ['@message', 'message', 'log'];

export function arrayValuesToCsvString(row: ReadonlyArray<GOLogsInsightsResultField>): string {
  const values: string[] = [];
  for (const item of row) {
    if (item.field !== '@ptr') {
      values.push(item.value ?? '');
    }
  }
  return values.join();
}

export function collectDistinctCids(
  rows: ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>,
): ReadonlyArray<string> {
  const cids: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const cid = extractCid(row);
    if (cid === undefined || seen.has(cid)) continue;

    seen.add(cid);
    cids.push(cid);
  }

  return cids;
}

export function rowsWithoutCid(
  rows: ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>,
): ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>> {
  return rows.filter((row) => extractCid(row) === undefined);
}

function extractCid(row: ReadonlyArray<GOLogsInsightsResultField>): string | undefined {
  const explicit = trimToUndefined(readRowFields(row, CID_FIELDS)[0]);
  if (explicit !== undefined) return explicit;

  for (const candidate of readRowFields(row, MESSAGE_FIELDS)) {
    const cid = trimToUndefined(CID_PATTERN.exec(candidate)?.[1]);
    if (cid !== undefined) return cid;
  }

  return undefined;
}
