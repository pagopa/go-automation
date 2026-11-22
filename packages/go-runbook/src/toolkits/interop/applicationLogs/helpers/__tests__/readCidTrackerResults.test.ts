import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { readCidTrackerResults } from '../readCidTrackerResults.js';
import { logRow } from '../../../../../__tests__/helpers/logRow.js';

describe('readCidTrackerResults', () => {
  it('keeps the reads with a string CID and valid rows', () => {
    const rows = [logRow({ '@message': 'ok' })];
    assert.deepStrictEqual(
      readCidTrackerResults([{ cid: 'a', rows }, { cid: 1, rows }, { cid: 'b' }, { cid: 'c', rows: 'x' }, null]),
      [{ cid: 'a', rows }],
    );
  });

  it('reads nothing from an output that is not a list', () => {
    assert.strictEqual(readCidTrackerResults(undefined), undefined);
    assert.strictEqual(readCidTrackerResults({ cid: 'a' }), undefined);
  });
});
