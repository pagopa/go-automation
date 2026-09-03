import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ResultField } from '@aws-sdk/client-cloudwatch-logs';

import { readResultFieldRows, readRowField, readRowFields } from '../AWSCloudWatchResultRows.js';

const row: ReadonlyArray<ResultField> = [
  { field: '@timestamp', value: '2026-01-01T00:00:00.000Z' },
  { field: '@message', value: 'boom' },
  { field: 'message', value: 'boom again' },
];

describe('readRowField', () => {
  it('reads a field by name', () => {
    assert.strictEqual(readRowField(row, '@message'), 'boom');
  });

  it('returns undefined for a missing field', () => {
    assert.strictEqual(readRowField(row, 'requestId'), undefined);
  });
});

describe('readRowFields', () => {
  it('collects every matching field in row order', () => {
    assert.deepStrictEqual(readRowFields(row, ['@message', 'message']), ['boom', 'boom again']);
  });

  it('skips fields with no value and returns empty when nothing matches', () => {
    assert.deepStrictEqual(readRowFields([{ field: 'cid' }], ['cid']), []);
    assert.deepStrictEqual(readRowFields(row, ['cid']), []);
  });
});

describe('readResultFieldRows', () => {
  it('returns an empty array for a value that is not a result set', () => {
    assert.deepStrictEqual(readResultFieldRows(undefined), []);
    assert.deepStrictEqual(readResultFieldRows('rows'), []);
  });

  it('skips non-array rows but keeps rows whose fields were all discarded', () => {
    const rows = readResultFieldRows([row, 'not-a-row', ['not-a-field']]);
    assert.strictEqual(rows.length, 2);
    assert.deepStrictEqual(rows[1], []);
  });
});
