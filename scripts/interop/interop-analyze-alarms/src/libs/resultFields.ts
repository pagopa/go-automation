import { readRowFields, type ResultField } from '@go-automation/go-common/aws';
import { trimToUndefined } from '@go-automation/go-common/core';

const CID_PATTERN = /\bCID=([^\]\s,"']+)/u;

/** Field names that may carry the correlation id explicitly. */
const CID_FIELDS: ReadonlyArray<string> = ['cid', 'CID'];

/** Field names whose text may embed a `CID=...` token. */
const MESSAGE_FIELDS: ReadonlyArray<string> = ['@message', 'message', 'log'];

export function arrayValuesToCsvString(row: ReadonlyArray<ResultField>): string {
  const values: string[] = [];
  for (const item of row) {
    if (item.field !== '@ptr') {
      values.push(item.value ?? '');
    }
  }
  return values.join();
}

export function collectDistinctCids(rows: ReadonlyArray<ReadonlyArray<ResultField>>): ReadonlyArray<string> {
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
  rows: ReadonlyArray<ReadonlyArray<ResultField>>,
): ReadonlyArray<ReadonlyArray<ResultField>> {
  return rows.filter((row) => extractCid(row) === undefined);
}

function extractCid(row: ReadonlyArray<ResultField>): string | undefined {
  const explicit = trimToUndefined(readRowFields(row, CID_FIELDS)[0]);
  if (explicit !== undefined) return explicit;

  for (const candidate of readRowFields(row, MESSAGE_FIELDS)) {
    const cid = trimToUndefined(CID_PATTERN.exec(candidate)?.[1]);
    if (cid !== undefined) return cid;
  }

  return undefined;
}
