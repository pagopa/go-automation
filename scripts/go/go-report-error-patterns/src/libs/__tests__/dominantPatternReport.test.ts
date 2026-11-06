import assert from 'node:assert/strict';
import test from 'node:test';
import type { Core } from '@go-automation/go-common';
import {
  REPORT_TYPE,
  REPORT_DESCRIPTION,
  REPORT_FILENAME,
  buildReport,
  printReport,
} from '../reports/dominantPatternReport.js';
import type { OccurrenceQueryResult } from '../../types/PatternTypes.js';

test('dominantPatternReport has valid metadata and non-empty description', () => {
  assert.strictEqual(REPORT_TYPE, 'dominant-pattern');
  assert.strictEqual(REPORT_FILENAME, 'report-dominant-pattern.json');
  assert.ok(typeof REPORT_DESCRIPTION === 'string');
  assert.ok(REPORT_DESCRIPTION.trim().length > 0, 'REPORT_DESCRIPTION must not be empty');
});

test('dominantPatternReport buildReport builds correct report structure', () => {
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
        { pattern: 'Error: bad request', ratio: 0.2 },
      ],
    },
    {
      occurrence: {
        timestamp: new Date('2026-11-01T11:00:00Z'),
        queryStartTime: new Date('2026-11-01T10:58:00Z'),
        queryEndTime: new Date('2026-11-01T11:01:00Z'),
        evaluatingDatapointTimestamps: [],
      },
      patterns: [],
    },
  ];

  const report = buildReport('test-profile', 'test-alarm', mockResults);
  assert.strictEqual(report.reportType, 'dominant-pattern');
  assert.strictEqual(report.profile, 'test-profile');
  assert.strictEqual(report.alarmName, 'test-alarm');
  assert.strictEqual(report.totalOccurrences, 2);
  assert.strictEqual(report.occurrencesWithPatterns, 1);
  assert.strictEqual(report.occurrencesWithoutPatterns, 1);
  assert.strictEqual(report.dominantPatterns.length, 1);
  assert.strictEqual(report.dominantPatterns[0]?.pattern, 'Error: timeout');
  assert.strictEqual(report.dominantPatterns[0]?.count, 1);
  assert.strictEqual(report.dominantPatterns[0]?.percentage, 50);
});

test('dominantPatternReport printReport executes successfully with ties note', () => {
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

  const mockReport = {
    reportType: 'dominant-pattern' as const,
    description: REPORT_DESCRIPTION,
    profile: 'test-profile',
    alarmName: 'test-alarm',
    totalOccurrences: 2,
    occurrencesWithPatterns: 2,
    occurrencesWithoutPatterns: 0,
    dominantPatterns: [
      { pattern: 'timeout', count: 2, percentage: 100, hasTies: true },
    ],
  };

  printReport(mockScript, mockReport);
  assert.ok(logs.some((l) => l.includes('Report Dominant Pattern')));
  assert.ok(logs.some((l) => l.includes('test-alarm')));
  assert.ok(logs.some((l) => l.includes('* = selezionato in presenza di pareggio')));
});
