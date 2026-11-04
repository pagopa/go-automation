import assert from 'node:assert/strict';
import test from 'node:test';
import type { AlarmHistoryItem } from '@go-automation/go-common/aws';
import { parseDateInput, extractAlarmOccurrenceWindow } from '../alarm-evaluator.js';
import { extractPatternFromRow, aggregatePatternFrequencies } from '../pattern-analyzer.js';

test('parseDateInput parses ISO string, timestamp number and Date', () => {
  const iso = '2026-11-01T10:00:00.000Z';
  const expectedMs = new Date(iso).getTime();

  assert.strictEqual(parseDateInput(iso).getTime(), expectedMs);
  assert.strictEqual(parseDateInput(expectedMs).getTime(), expectedMs);
  // Seconds epoch
  assert.strictEqual(parseDateInput(Math.floor(expectedMs / 1000)).getTime(), Math.floor(expectedMs / 1000) * 1000);
});

test('extractAlarmOccurrenceWindow uses evaluatingDatapoints when available', () => {
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

  // min timestamp = 12:03:00. Start = 12:03:00 - 60s (period) - 10s (buffer) = 12:01:50
  assert.strictEqual(window.queryStartTime.toISOString(), '2026-11-01T12:01:50.000Z');
  // max timestamp = 12:04:00. End = 12:04:00 + 10s (buffer) = 12:04:10
  assert.strictEqual(window.queryEndTime.toISOString(), '2026-11-01T12:04:10.000Z');
});

test('extractPatternFromRow extracts ratio, sampleCount and pattern correctly by name and index', () => {
  const rowNamed = [
    { field: '@ratio', value: '0.25' },
    { field: 'other', value: 'xxx' },
    { field: '@sampleCount', value: '10' },
    { field: '@pattern', value: 'Error: Connection reset by peer' },
  ];
  const resultNamed = extractPatternFromRow(rowNamed);
  assert.ok(resultNamed);
  assert.strictEqual(resultNamed.pattern, 'Error: Connection reset by peer');
  assert.strictEqual(resultNamed.ratio, 0.25);
  assert.strictEqual(resultNamed.sampleCount, 10);

  // By column position (1: ratio, 5: sampleCount, 8: pattern in 1-based indexing)
  const rowPositional = [
    { field: 'col1', value: '0.75' }, // idx 0 (1-based: 1)
    { field: 'col2', value: 'foo' },
    { field: 'col3', value: 'bar' },
    { field: 'col4', value: 'baz' },
    { field: 'col5', value: '30' },   // idx 4 (1-based: 5)
    { field: 'col6', value: 'qux' },
    { field: 'col7', value: 'quux' },
    { field: 'col8', value: 'Exception occurred in cluster' }, // idx 7 (1-based: 8)
  ];
  const resultPositional = extractPatternFromRow(rowPositional);
  assert.ok(resultPositional);
  assert.strictEqual(resultPositional.pattern, 'Exception occurred in cluster');
  assert.strictEqual(resultPositional.ratio, 0.75);
  assert.strictEqual(resultPositional.sampleCount, 30);
});

test('aggregatePatternFrequencies sums total patterns and calculates percentages across occurrences', () => {
  const occurrence = {
    timestamp: new Date(),
    queryStartTime: new Date(),
    queryEndTime: new Date(),
    evaluatingDatapointTimestamps: [],
  };

  // Esempio: 7 pattern totali, 7 pattern di tipo pippo -> pippo rappresenta il 100%
  const results = [
    {
      occurrence,
      patterns: [
        { pattern: 'pippo', sampleCount: 1, ratio: 0.5 },
        { pattern: 'pippo', sampleCount: 1, ratio: 0.5 },
      ],
    },
    {
      occurrence,
      patterns: [
        { pattern: 'pippo', sampleCount: 1, ratio: 1 },
        { pattern: 'pluto', sampleCount: 1, ratio: 1 },
      ],
    },
  ];

  const { totalPatternsCount, frequencies } = aggregatePatternFrequencies(results);
  assert.strictEqual(totalPatternsCount, 4);
  assert.strictEqual(frequencies.length, 2);

  // pippo: 3 su 4 = 75%
  assert.strictEqual(frequencies[0]?.pattern, 'pippo');
  assert.strictEqual(frequencies[0]?.count, 3);
  assert.strictEqual(frequencies[0]?.percentage, 75);

  // pluto: 1 su 4 = 25%
  assert.strictEqual(frequencies[1]?.pattern, 'pluto');
  assert.strictEqual(frequencies[1]?.count, 1);
  assert.strictEqual(frequencies[1]?.percentage, 25);
});
