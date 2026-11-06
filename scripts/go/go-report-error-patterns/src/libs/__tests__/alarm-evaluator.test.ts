import assert from 'node:assert/strict';
import test from 'node:test';
import type { AlarmHistoryItem } from '@go-automation/go-common/aws';
import { parseDateInput, extractAlarmOccurrenceWindow } from '../alarm-evaluator.js';

test('parseDateInput parses ISO string, timestamp number and Date', () => {
  const iso = '2026-11-01T10:00:00.000Z';
  const expectedMs = new Date(iso).getTime();

  assert.strictEqual(parseDateInput(iso).getTime(), expectedMs);
  assert.strictEqual(parseDateInput(expectedMs).getTime(), expectedMs);
  // Seconds epoch
  assert.strictEqual(parseDateInput(Math.floor(expectedMs / 1000)).getTime(), Math.floor(expectedMs / 1000) * 1000);
});

test('extractAlarmOccurrenceWindow uses evaluatingDatapoints when available with extra seconds', () => {
  const item: AlarmHistoryItem = {
    AlarmName: 'test-alarm',
    Timestamp: new Date('2026-11-01T12:05:00Z'),
    HistorySummary: 'Alarm transitioned from OK to ALARM',
    HistoryData: JSON.stringify({
      trigger: {
        period: 60,
        evaluatingDatapoints: [
          { timestamp: '2026-11-01T12:03:00.000Z', value: 10 },
          { timestamp: '2026-11-01T12:04:00.000Z', value: 15 },
        ],
      },
    }),
  };

  const window = extractAlarmOccurrenceWindow(item, 10);
  assert.ok(window);
  assert.strictEqual(window.evaluatingDatapointTimestamps.length, 2);

  // min timestamp = 12:03:00. Start = 12:03:00 - 60s (period) - 10s (extra seconds) = 12:01:50
  assert.strictEqual(window.queryStartTime.toISOString(), '2026-11-01T12:01:50.000Z');
  // max timestamp = 12:04:00. End = 12:04:00 + 10s (extra seconds) = 12:04:10
  assert.strictEqual(window.queryEndTime.toISOString(), '2026-11-01T12:04:10.000Z');
});
