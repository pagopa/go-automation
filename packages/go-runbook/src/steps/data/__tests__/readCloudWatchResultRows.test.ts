import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readCloudWatchResultRows } from '../readCloudWatchResultRows.js';

describe('readCloudWatchResultRows', () => {
  it('returns undefined for a missing or invalid step output', () => {
    assert.strictEqual(readCloudWatchResultRows(undefined), undefined);
    assert.strictEqual(readCloudWatchResultRows({}), undefined);
  });

  it('keeps valid rows and filters invalid fields', () => {
    assert.deepStrictEqual(
      readCloudWatchResultRows([
        [
          { field: '@message', value: 'first' },
          { field: 'count', value: 123 },
          { field: 456, value: 'invalid field' },
          null,
          'invalid',
        ],
        'invalid row',
        [{ field: 'count', value: '2' }, { field: 'optional-value' }],
      ]),
      [[{ field: '@message', value: 'first' }], [{ field: 'count', value: '2' }, { field: 'optional-value' }]],
    );
  });

  it('preserves an empty result set', () => {
    assert.deepStrictEqual(readCloudWatchResultRows([]), []);
  });
});
