import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Runbook } from '../../../../../engine/types/Runbook.js';

import { computeRunbookTimeRange, resolveOccurrenceTimeWindow } from '../computeRunbookTimeRange.js';

type WindowOnlyRunbook = Pick<Runbook, 'occurrenceTimeWindow'>;

describe('computeRunbookTimeRange', () => {
  it('uses the standard 5/5 window unless the runbook declares its own, asymmetric one', () => {
    const occurrence = { kind: 'single', at: '2026-05-11T14:00:00.000Z' } as const;
    const standard: WindowOnlyRunbook = {};
    const asymmetric: WindowOnlyRunbook = { occurrenceTimeWindow: { beforeMinutes: 10, afterMinutes: 5 } };

    assert.deepStrictEqual(resolveOccurrenceTimeWindow(standard), { beforeMinutes: 5, afterMinutes: 5 });
    assert.deepStrictEqual(computeRunbookTimeRange(standard, occurrence), {
      startTime: '2026-05-11T13:55:00.000Z',
      endTime: '2026-05-11T14:05:00.000Z',
    });
    assert.deepStrictEqual(computeRunbookTimeRange(asymmetric, occurrence), {
      startTime: '2026-05-11T13:50:00.000Z',
      endTime: '2026-05-11T14:05:00.000Z',
    });
  });
});
