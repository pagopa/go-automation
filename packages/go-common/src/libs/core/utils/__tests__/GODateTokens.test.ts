import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GODateTokens } from '../GODateTokens.js';

describe('GODateTokens', () => {
  it('parses common formats and formats Athena date/time values', () => {
    assert.strictEqual(GODateTokens.parse('1767225600').toISOString(), '2026-01-01T00:00:00.000Z');
    assert.strictEqual(
      GODateTokens.formatAthenaDateTime(new Date('2026-05-01T03:04:05Z'), 'UTC'),
      '2026-05-01 03:04:05',
    );
  });

  it('produces zero-padded range tokens', () => {
    const tokens = GODateTokens.fromRange(new Date('2026-05-01T03:00:00Z'), new Date('2026-05-02T04:00:00Z'), 'UTC');

    assert.strictEqual(tokens.startYear, '2026');
    assert.strictEqual(tokens.startMonth, '05');
    assert.strictEqual(tokens.startDay, '01');
    assert.strictEqual(tokens.startHour, '03');
    assert.strictEqual(tokens.startPartitionHour, '2026050103');
    assert.strictEqual(tokens.endPartitionHour, '2026050204');
  });
});
