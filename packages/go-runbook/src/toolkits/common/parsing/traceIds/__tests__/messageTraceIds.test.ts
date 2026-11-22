import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { messageTraceIds } from '../traceIdentity.js';

describe('messageTraceIds', () => {
  it('reads the X-Ray and the compact forms, in lowercase and uppercase, as one canonical id', () => {
    assert.deepEqual(
      [...messageTraceIds('a 1-6789abcd-0123456789abcdef01234567 b 6789ABCD0123456789ABCDEF01234567 c')],
      ['1-6789abcd-0123456789abcdef01234567'],
    );
  });

  it('ignores a hex value that is part of a longer token', () => {
    assert.equal(messageTraceIds('id=6789abcd0123456789abcdef01234567ff').size, 0);
  });
});
