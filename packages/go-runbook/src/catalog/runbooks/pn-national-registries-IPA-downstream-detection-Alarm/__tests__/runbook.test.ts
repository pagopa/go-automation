import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeRunbookTimeRange } from '../../../computeRunbookTimeRange.js';
import { buildRunbook } from '../runbook.js';

describe('IPA downstream alarm diagnostic window', () => {
  it('covers all six 5-minute periods before the alarm and one period after it', () => {
    const range = computeRunbookTimeRange(buildRunbook(), {
      kind: 'single',
      at: '2026-04-23T10:30:00.000Z',
    });
    assert.deepStrictEqual(range, {
      startTime: '2026-04-23T10:00:00.000Z',
      endTime: '2026-04-23T10:35:00.000Z',
    });
    // Three breached periods can occur early in the evaluation window.
    // The former 10-minute lookback dropped all three of these datapoints.
    for (const datapoint of ['2026-04-23T10:00:00Z', '2026-04-23T10:05:00Z', '2026-04-23T10:10:00Z']) {
      assert.ok(Date.parse(datapoint) >= Date.parse(range.startTime));
      assert.ok(Date.parse(datapoint) <= Date.parse(range.endTime));
    }
  });

  it('covers the full first evaluation window and the final period for multiple occurrences', () => {
    assert.deepStrictEqual(
      computeRunbookTimeRange(buildRunbook(), {
        kind: 'multi',
        first: '2026-04-23T10:30:00.000Z',
        last: '2026-04-23T11:00:00.000Z',
      }),
      {
        startTime: '2026-04-23T10:00:00.000Z',
        endTime: '2026-04-23T11:05:00.000Z',
      },
    );
  });
});
