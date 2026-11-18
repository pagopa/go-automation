import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeRunbookTimeRange } from '../../../../../runtime/index.js';
import { buildRunbook } from '../runbook.js';

describe('IPA downstream alarm diagnostic window', () => {
  it('covers all six 5-minute periods before the alarm and one period after it', () => {
    const range = computeRunbookTimeRange(buildRunbook(), { kind: 'single', at: '2026-04-23T10:30:00.000Z' });
    // Three breached periods can occur early in the evaluation window: the
    // former 10-minute lookback dropped the datapoints at 10:00, 10:05 and 10:10.
    assert.deepStrictEqual(range, { startTime: '2026-04-23T10:00:00.000Z', endTime: '2026-04-23T10:35:00.000Z' });
  });
});
