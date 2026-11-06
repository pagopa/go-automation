import assert from 'node:assert/strict';
import test from 'node:test';
import type { Core } from '@go-automation/go-common';
import {
  REPORT_TYPE,
  REPORT_DESCRIPTION,
  REPORT_FILENAME,
  buildReport,
  printReport,
} from '../reports/tiedPatternCombinationsReport.js';
import type { OccurrenceQueryResult } from '../../types/PatternTypes.js';

test('tiedPatternCombinationsReport has valid metadata and non-empty description', () => {
  assert.strictEqual(REPORT_TYPE, 'tied-pattern-combinations');
  assert.strictEqual(REPORT_FILENAME, 'report-tied-pattern-combinations.json');
  assert.ok(typeof REPORT_DESCRIPTION === 'string');
  assert.ok(REPORT_DESCRIPTION.trim().length > 0, 'REPORT_DESCRIPTION must not be empty');
});

test('tiedPatternCombinationsReport buildReport handles occurrences with ties', () => {
  const mockResults: OccurrenceQueryResult[] = [
    {
      occurrence: {
        timestamp: new Date('2026-11-01T10:00:00Z'),
        queryStartTime: new Date('2026-11-01T09:58:00Z'),
        queryEndTime: new Date('2026-11-01T10:01:00Z'),
        evaluatingDatapointTimestamps: [],
      },
      patterns: [
        { pattern: 'Error: timeout', ratio: 0.5 },
        { pattern: 'Error: conn refused', ratio: 0.5 },
      ],
    },
  ];

  const report = buildReport('test-profile', 'test-alarm', mockResults);
  assert.strictEqual(report.reportType, 'tied-pattern-combinations');
  assert.strictEqual(report.profile, 'test-profile');
  assert.strictEqual(report.alarmName, 'test-alarm');
  assert.strictEqual(report.totalOccurrences, 1);
  assert.strictEqual(report.message, null);
  assert.strictEqual(report.tiedCombinations.length, 1);
  assert.deepStrictEqual(report.tiedCombinations[0]?.patterns, ['Error: conn refused', 'Error: timeout']);
  assert.strictEqual(report.tiedCombinations[0]?.count, 1);
  assert.strictEqual(report.tiedCombinations[0]?.percentage, 100);
});

test('tiedPatternCombinationsReport buildReport handles occurrences without ties', () => {
  const mockResults: OccurrenceQueryResult[] = [
    {
      occurrence: {
        timestamp: new Date('2026-11-01T10:00:00Z'),
        queryStartTime: new Date('2026-11-01T09:58:00Z'),
        queryEndTime: new Date('2026-11-01T10:01:00Z'),
        evaluatingDatapointTimestamps: [],
      },
      patterns: [
        { pattern: 'Error: timeout', ratio: 0.8 },
        { pattern: 'Error: conn refused', ratio: 0.2 },
      ],
    },
  ];

  const report = buildReport('test-profile', 'test-alarm', mockResults);
  assert.strictEqual(report.reportType, 'tied-pattern-combinations');
  assert.strictEqual(report.totalOccurrences, 1);
  assert.strictEqual(report.message, 'Nessuna occorrenza con pattern in pareggio rilevata.');
  assert.deepStrictEqual(report.tiedCombinations, []);
});

test('tiedPatternCombinationsReport printReport executes with and without ties', () => {
  const logs: string[] = [];
  const mockScript = {
    logger: {
      section(msg: string) {
        logs.push(`SECTION: ${msg}`);
      },
      info(msg: string) {
        logs.push(`INFO: ${msg}`);
      },
      warning(msg: string) {
        logs.push(`WARNING: ${msg}`);
      },
      newline() {},
      simpleTable() {
        logs.push('TABLE');
      },
    },
  } as unknown as Core.GOScript;

  // With ties
  const reportWithTies = {
    reportType: 'tied-pattern-combinations' as const,
    description: REPORT_DESCRIPTION,
    profile: 'test-profile',
    alarmName: 'test-alarm',
    totalOccurrences: 1,
    message: null,
    tiedCombinations: [
      { patterns: ['conn_refused', 'timeout'], count: 1, percentage: 100 },
    ],
  };

  printReport(mockScript, reportWithTies);
  assert.ok(logs.some((l) => l.includes('Report Tied Pattern Combinations')));
  assert.ok(logs.includes('TABLE'));

  // Without ties
  logs.length = 0;
  const reportWithoutTies = {
    reportType: 'tied-pattern-combinations' as const,
    description: REPORT_DESCRIPTION,
    profile: 'test-profile',
    alarmName: 'test-alarm',
    totalOccurrences: 1,
    message: 'Nessuna occorrenza con pattern in pareggio rilevata.',
    tiedCombinations: [],
  };

  printReport(mockScript, reportWithoutTies);
  assert.ok(logs.some((l) => l.includes('Nessuna occorrenza con pattern in pareggio rilevata')));
  assert.ok(!logs.includes('TABLE'));
});
