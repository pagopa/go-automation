import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isEarlier } from '../isEarlier.js';

describe('isEarlier', () => {
  it('orders timed values by time, before every untimed one', () => {
    assert.strictEqual(isEarlier('2026-01-01T00:00:00Z', '2026-01-01T00:00:01Z'), true);
    assert.strictEqual(isEarlier('2026-01-01T00:00:01Z', '2026-01-01T00:00:00Z'), false);
    assert.strictEqual(isEarlier('2026-01-01T00:00:00Z', undefined), true);
    assert.strictEqual(isEarlier(undefined, '2026-01-01T00:00:00Z'), false);
    assert.strictEqual(isEarlier(undefined, undefined), false);
  });
});
