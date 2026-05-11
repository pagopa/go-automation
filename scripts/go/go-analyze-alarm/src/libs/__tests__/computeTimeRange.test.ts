import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeTimeRange } from '../computeTimeRange.js';

describe('computeTimeRange', () => {
  describe('single reference', () => {
    it('produces a symmetric window around the alarm timestamp', () => {
      const { startTime, endTime } = computeTimeRange({ kind: 'single', at: '2026-05-11T14:00:00.000Z' }, 5);
      assert.strictEqual(startTime, '2026-05-11T13:55:00.000Z');
      assert.strictEqual(endTime, '2026-05-11T14:05:00.000Z');
    });

    it('honours a zero window', () => {
      const { startTime, endTime } = computeTimeRange({ kind: 'single', at: '2026-05-11T14:00:00.000Z' }, 0);
      assert.strictEqual(startTime, '2026-05-11T14:00:00.000Z');
      assert.strictEqual(endTime, '2026-05-11T14:00:00.000Z');
    });

    it('throws on an invalid ISO datetime', () => {
      assert.throws(
        () => computeTimeRange({ kind: 'single', at: 'not-a-date' }, 5),
        /Invalid alarmDatetime: "not-a-date"/,
      );
    });
  });

  describe('multi reference', () => {
    it('anchors the window to first/last occurrence', () => {
      const { startTime, endTime } = computeTimeRange(
        { kind: 'multi', first: '2026-05-11T14:00:00.000Z', last: '2026-05-11T14:30:00.000Z' },
        5,
      );
      assert.strictEqual(startTime, '2026-05-11T13:55:00.000Z');
      assert.strictEqual(endTime, '2026-05-11T14:35:00.000Z');
    });

    it('accepts a single-point multi range', () => {
      const { startTime, endTime } = computeTimeRange(
        { kind: 'multi', first: '2026-05-11T14:00:00.000Z', last: '2026-05-11T14:00:00.000Z' },
        5,
      );
      assert.strictEqual(startTime, '2026-05-11T13:55:00.000Z');
      assert.strictEqual(endTime, '2026-05-11T14:05:00.000Z');
    });

    it('rejects an inverted range', () => {
      assert.throws(
        () =>
          computeTimeRange({ kind: 'multi', first: '2026-05-11T14:30:00.000Z', last: '2026-05-11T14:00:00.000Z' }, 5),
        /last \([^)]+\) is before first/,
      );
    });

    it('throws on an invalid first/last timestamp', () => {
      assert.throws(
        () => computeTimeRange({ kind: 'multi', first: 'bad', last: '2026-05-11T14:00:00.000Z' }, 5),
        /Invalid alarmDatetime \(first occurrence\)/,
      );
      assert.throws(
        () => computeTimeRange({ kind: 'multi', first: '2026-05-11T14:00:00.000Z', last: 'bad' }, 5),
        /Invalid alarmDatetime \(last occurrence\)/,
      );
    });
  });
});
