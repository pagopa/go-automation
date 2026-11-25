import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mergeObservations } from '../mergeObservations.js';

describe('mergeObservations', () => {
  it('keeps the earliest observation of each value, in time order, untimed ones last', () => {
    assert.deepEqual(
      mergeObservations([
        { kind: 'requestId', value: 'r1', observedAt: '2026-01-01T00:05:00.000Z' },
        { kind: 'traceId', value: 't1' },
        { kind: 'requestId', value: 'r1', observedAt: '2026-01-01T00:01:00.000Z' },
        { kind: 'requestId', value: 'r2', observedAt: '2026-01-01T00:03:00.000Z' },
        { kind: 'traceId', value: 't1', observedAt: '2026-01-01T00:04:00.000Z' },
        { kind: 'fallbackUuid', value: 'u1' },
      ]),
      [
        { kind: 'requestId', value: 'r1', observedAt: '2026-01-01T00:01:00.000Z' },
        { kind: 'requestId', value: 'r2', observedAt: '2026-01-01T00:03:00.000Z' },
        { kind: 'traceId', value: 't1', observedAt: '2026-01-01T00:04:00.000Z' },
        { kind: 'fallbackUuid', value: 'u1' },
      ],
    );
  });

  it('keeps apart the same value of two kinds and the first of two equal times', () => {
    const first = { kind: 'requestId' as const, value: 'x', observedAt: '2026-01-01T00:00:00.000Z' };
    assert.deepEqual(
      mergeObservations([first, { kind: 'traceId', value: 'x' }, { ...first }]).map((o) => o.kind),
      ['requestId', 'traceId'],
    );
  });
});
