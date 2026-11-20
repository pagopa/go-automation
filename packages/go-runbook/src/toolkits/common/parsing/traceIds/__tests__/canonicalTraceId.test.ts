import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { canonicalTraceId } from '../canonicalTraceId.js';

const CANONICAL = '1-6789abcd-0123456789abcdef01234567';

describe('canonicalTraceId', () => {
  it('gives one lowercase id for every form and casing of the same trace', () => {
    for (const raw of [
      CANONICAL,
      '1-6789ABCD-0123456789ABCDEF01234567',
      '6789abcd0123456789abcdef01234567',
      '6789ABCD0123456789ABCDEF01234567',
      'Root=1-6789ABCD-0123456789abcdef01234567;Sampled=1',
    ]) {
      assert.equal(canonicalTraceId(raw), CANONICAL, raw);
    }
  });

  it('returns nothing for a value that is not a trace id', () => {
    assert.equal(canonicalTraceId('not-a-trace'), undefined);
  });
});
