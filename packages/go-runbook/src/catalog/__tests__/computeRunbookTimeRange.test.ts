import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Runbook } from '../../types/Runbook.js';

import { computeRunbookTimeRange, resolveOccurrenceTimeWindow } from '../computeRunbookTimeRange.js';

type WindowOnlyRunbook = Pick<Runbook, 'occurrenceTimeWindow'>;

describe('computeRunbookTimeRange', () => {
  it('uses the standard 5/5 window when the runbook does not override it', () => {
    const runbook: WindowOnlyRunbook = {};

    assert.deepStrictEqual(resolveOccurrenceTimeWindow(runbook), { beforeMinutes: 5, afterMinutes: 5 });
    assert.deepStrictEqual(computeRunbookTimeRange(runbook, { kind: 'single', at: '2026-05-11T14:00:00.000Z' }), {
      startTime: '2026-05-11T13:55:00.000Z',
      endTime: '2026-05-11T14:05:00.000Z',
    });
  });

  it('uses the asymmetric window declared by the runbook', () => {
    const runbook: WindowOnlyRunbook = {
      occurrenceTimeWindow: { beforeMinutes: 10, afterMinutes: 5 },
    };

    assert.deepStrictEqual(computeRunbookTimeRange(runbook, { kind: 'single', at: '2026-05-11T14:00:00.000Z' }), {
      startTime: '2026-05-11T13:50:00.000Z',
      endTime: '2026-05-11T14:05:00.000Z',
    });
  });
});
