import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runbookIdError } from '../validation/runbookIdError.js';

describe('runbookIdError', () => {
  it('accepts a typical runbook id', () => {
    assert.strictEqual(runbookIdError('pn-delivery-B2B-ApiGwAlarm'), undefined);
  });

  it('rejects empty ids', () => {
    assert.notStrictEqual(runbookIdError(''), undefined);
  });

  it('rejects ids with spaces', () => {
    assert.notStrictEqual(runbookIdError('has space'), undefined);
  });

  it('rejects ids with path separators', () => {
    assert.notStrictEqual(runbookIdError('foo/bar'), undefined);
  });
});
