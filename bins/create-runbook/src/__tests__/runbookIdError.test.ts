import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runbookIdError } from '../validation/runbookIdError.js';

describe('runbookIdError', () => {
  it('accepts a typical runbook id and rejects empty ids, spaces and path separators', () => {
    assert.strictEqual(runbookIdError('pn-delivery-B2B-ApiGwAlarm'), undefined);
    for (const id of ['', 'has space', 'foo/bar']) {
      assert.notStrictEqual(runbookIdError(id), undefined, JSON.stringify(id));
    }
  });
});
