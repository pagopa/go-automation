import assert from 'node:assert/strict';
import test from 'node:test';
import type { Core } from '@go-automation/go-common';
import {
  REPORT_TYPE,
  REPORT_DESCRIPTION,
  REPORT_FILENAME,
  buildReport,
  printReport,
} from '../reports/patternCoverageReport.js';
import type { OccurrenceQueryResult } from '../../types/PatternTypes.js';

test('patternCoverageReport has valid metadata and non-empty description', () => {
  assert.strictEqual(REPORT_TYPE, 'pattern-coverage');
  assert.strictEqual(REPORT_FILENAME, 'report-pattern-coverage.json');
  assert.ok(typeof REPORT_DESCRIPTION === 'string');
  assert.ok(REPORT_DESCRIPTION.trim().length > 0, 'REPORT_DESCRIPTION must not be empty');
});

test('patternCoverageReport buildReport builds correct report structure', () => {
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
      patterns: [{ pattern: 'Error: timeout', ratio: 1.0 }],
    },
  ];

  const report = buildReport('test-profile', 'test-alarm', mockResults);
  assert.strictEqual(report.reportType, 'pattern-coverage');
  assert.strictEqual(report.profile, 'test-profile');
  assert.strictEqual(report.alarmName, 'test-alarm');
  assert.strictEqual(report.totalOccurrences, 2);
  assert.strictEqual(report.occurrencesWithPatterns, 2);
  assert.strictEqual(report.occurrencesWithoutPatterns, 0);
  assert.strictEqual(report.patternCoverage.length, 2);

  const timeoutItem = report.patternCoverage.find((p) => p.pattern === 'Error: timeout');
  assert.ok(timeoutItem);
  assert.strictEqual(timeoutItem.count, 2);
  assert.strictEqual(timeoutItem.percentage, 100);

  const badReqItem = report.patternCoverage.find((p) => p.pattern === 'Error: bad request');
  assert.ok(badReqItem);
  assert.strictEqual(badReqItem.count, 1);
  assert.strictEqual(badReqItem.percentage, 50);
});

test('patternCoverageReport printReport executes successfully', () => {
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
    reportType: 'pattern-coverage' as const,
    description: REPORT_DESCRIPTION,
    profile: 'test-profile',
    alarmName: 'test-alarm',
    totalOccurrences: 2,
    occurrencesWithPatterns: 2,
    occurrencesWithoutPatterns: 0,
    patternCoverage: [
      { pattern: 'timeout', count: 2, percentage: 100 },
    ],
  };

  printReport(mockScript, mockReport);
  assert.ok(logs.some((l) => l.includes('Report Pattern Coverage')));
  assert.ok(logs.some((l) => l.includes('test-alarm')));
  assert.ok(logs.includes('TABLE'));
});
