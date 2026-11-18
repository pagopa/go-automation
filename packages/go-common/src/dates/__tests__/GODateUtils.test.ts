import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatUtcDateTime } from '../GODateUtils.js';

describe('formatUtcDateTime', () => {
  it('formats ISO strings and Date instances as zero-padded dd/MM/yyyy HH.mm.ss in UTC', () => {
    const cases: ReadonlyArray<readonly [input: string | Date, expected: string]> = [
      ['2025-01-15T10:30:45.000Z', '15/01/2025 10.30.45'],
      [new Date('2025-06-01T14:05:00.000Z'), '01/06/2025 14.05.00'],
      ['2025-03-05T09:02:07.000Z', '05/03/2025 09.02.07'],
      ['2025-12-31T00:00:00.000Z', '31/12/2025 00.00.00'],
      ['2025-01-01T23:59:59.000Z', '01/01/2025 23.59.59'],
      // A negative offset crossing midnight is normalized to the next UTC day.
      ['2025-01-15T23:30:45.000-02:00', '16/01/2025 01.30.45'],
      ['not-a-date', 'Invalid DateTime'],
    ];
    for (const [input, expected] of cases) {
      assert.strictEqual(formatUtcDateTime(input), expected, String(input));
    }
  });
});
