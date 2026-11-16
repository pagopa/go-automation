import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createTimeRangeReference } from '../createTimeRangeReference.js';

describe('createTimeRangeReference', () => {
  it('creates a single reference when alarmDatetimeEnd is absent', () => {
    assert.deepStrictEqual(createTimeRangeReference('2026-05-13T10:00:00.000Z'), {
      kind: 'single',
      at: '2026-05-13T10:00:00.000Z',
    });
  });

  it('treats empty alarmDatetimeEnd as absent', () => {
    assert.deepStrictEqual(createTimeRangeReference('2026-05-13T10:00:00.000Z', ''), {
      kind: 'single',
      at: '2026-05-13T10:00:00.000Z',
    });
  });

  it('treats whitespace-only alarmDatetimeEnd as absent', () => {
    assert.deepStrictEqual(createTimeRangeReference('2026-05-13T10:00:00.000Z', '   '), {
      kind: 'single',
      at: '2026-05-13T10:00:00.000Z',
    });
  });

  it('creates a multi reference when alarmDatetimeEnd has a value', () => {
    assert.deepStrictEqual(createTimeRangeReference('2026-05-13T10:00:00.000Z', ' 2026-05-13T10:30:00.000Z '), {
      kind: 'multi',
      first: '2026-05-13T10:00:00.000Z',
      last: '2026-05-13T10:30:00.000Z',
    });
  });
});
