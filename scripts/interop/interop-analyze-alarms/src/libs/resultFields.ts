import type { ResultField } from '@go-automation/go-common/aws';

const CID_PATTERN = /\bCID=([^\]\s,"']+)/u;

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
  const explicit = normalize(readField(row, ['cid', 'CID']));
  if (explicit !== undefined) return explicit;

  for (const candidate of readFields(row, ['@message', 'message', 'log'])) {
    const match = CID_PATTERN.exec(candidate);
    const cid = normalize(match?.[1]);
    if (cid !== undefined) return cid;
  }

  return undefined;
}

function readField(row: ReadonlyArray<ResultField>, names: ReadonlyArray<string>): string | undefined {
  return readFields(row, names)[0];
}

function readFields(row: ReadonlyArray<ResultField>, names: ReadonlyArray<string>): ReadonlyArray<string> {
  const values: string[] = [];
  for (const field of row) {
    const fieldName = field.field;
    if (fieldName === undefined || !names.includes(fieldName)) continue;
    if (field.value !== undefined) values.push(field.value);
  }
  return values;
}

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}
