import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bareTraceId } from '../bareTraceId.js';

const CANONICAL = '1-3d472be7-2977635208a92722b97b5e24';

describe('bareTraceId', () => {
  it('gives the lowercase X-Ray form of a direct X-Ray or compact id', () => {
    for (const raw of [CANONICAL, '1-3D472BE7-2977635208A92722B97B5E24', '3d472be72977635208a92722b97b5e24']) {
      assert.equal(bareTraceId(raw), CANONICAL, raw);
    }
  });

  it('rejects malformed ids, headers and ids followed by other fields', () => {
    for (const malformed of [
      'not-a-trace-id',
      '1-3d472be7-2977635208a92722b97b5e2',
      '2-3d472be7-2977635208a92722b97b5e24',
      '3d472be72977635208a92722b97b5e2',
      `Root=${CANONICAL}`,
      `${CANONICAL};Sampled=1`,
      '',
    ]) {
      assert.equal(bareTraceId(malformed), undefined, malformed);
    }
  });
});
