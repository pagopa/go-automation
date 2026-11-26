import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { canonicalTraceId } from '../traceIdentity.js';

const CANONICAL = '1-6789abcd-0123456789abcdef01234567';
const OTHER = '1-00000000-111111111111111111111111';

describe('canonicalTraceId', () => {
  it('gives one lowercase id for every form and casing of the same trace', () => {
    for (const raw of [
      CANONICAL,
      '1-6789ABCD-0123456789ABCDEF01234567',
      '6789abcd0123456789abcdef01234567',
      '6789ABCD0123456789ABCDEF01234567',
      'Root=1-6789ABCD-0123456789abcdef01234567;Sampled=1',
      `Self=${OTHER};Root=${CANONICAL};Parent=f23cf74b4e3a3bc6;Sampled=0`,
      `${OTHER};Root=${CANONICAL}`,
      `  ${CANONICAL}  `,
    ]) {
      assert.equal(canonicalTraceId(raw), CANONICAL, raw);
    }
  });

  it('returns nothing for a value that is not a trace id', () => {
    for (const raw of [
      'not-a-trace',
      'Root=',
      `Self=${CANONICAL}`,
      `${CANONICAL};Sampled=1`,
      '6789abcd0123456789abcdef0123456',
      '6789abcd0123456789abcdef012345678',
      '',
    ]) {
      assert.equal(canonicalTraceId(raw), undefined, raw);
    }
  });
});
