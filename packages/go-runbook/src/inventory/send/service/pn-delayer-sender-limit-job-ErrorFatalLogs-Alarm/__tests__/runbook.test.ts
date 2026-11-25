import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DELAYER_ERROR_QUERY } from '../knownServices.js';

describe('pn-delayer sender limit job runbook', () => {
  it('limits the distinct rows the operator reads, not the input of the de-duplication', () => {
    // `limit` must stay after `dedup`: before it, it caps the input to the
    // de-duplication rather than the distinct rows the operator reads.
    assert.match(DELAYER_ERROR_QUERY, /\| dedup message\n\| limit 1000$/u);
  });
});
