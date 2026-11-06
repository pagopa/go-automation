import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Core } from '@go-automation/go-common';
import { exportAllReports } from '../report.js';
import {
  DominantPatternReportModule,
  PatternCoverageReportModule,
  TiedPatternCombinationsReportModule,
} from '../reports/index.js';
import type {
  DominantPatternReport,
  PatternCoverageReport,
  TiedPatternCombinationsReport,
} from '../../types/PatternTypes.js';

test('exportAllReports exports all three reports to execution output directory', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'error-patterns-test-'));

  const mockScript = {
    paths: {
      getExecutionOutputFilePath(fileName: string) {
        return path.join(tmpDir, fileName);
      },
    },
    logger: {
      info(_msg: string) {
        // no-op
      },
    },
  } as unknown as Core.GOScript;

  const mockDominantReports: DominantPatternReport[] = [
    {
      reportType: 'dominant-pattern',
      description: DominantPatternReportModule.REPORT_DESCRIPTION,
      profile: 'test-profile',
      alarmName: 'test-alarm',
      totalOccurrences: 1,
      occurrencesWithPatterns: 1,
      occurrencesWithoutPatterns: 0,
      dominantPatterns: [
        {
          pattern: 'Error: timeout',
          count: 1,
          percentage: 100,
          hasTies: false,
        },
      ],
    },
  ];

  const mockCoverageReports: PatternCoverageReport[] = [
    {
      reportType: 'pattern-coverage',
      description: PatternCoverageReportModule.REPORT_DESCRIPTION,
      profile: 'test-profile',
      alarmName: 'test-alarm',
      totalOccurrences: 1,
      occurrencesWithPatterns: 1,
      occurrencesWithoutPatterns: 0,
      patternCoverage: [
        {
          pattern: 'Error: timeout',
          count: 1,
          percentage: 100,
        },
      ],
    },
  ];

  const mockTiedReports: TiedPatternCombinationsReport[] = [
    {
      reportType: 'tied-pattern-combinations',
      description: TiedPatternCombinationsReportModule.REPORT_DESCRIPTION,
      profile: 'test-profile',
      alarmName: 'test-alarm',
      totalOccurrences: 1,
      message: 'Nessuna occorrenza con pattern in pareggio rilevata.',
      tiedCombinations: [],
    },
  ];

  const resultPaths = await exportAllReports(mockScript, {
    dominantReports: mockDominantReports,
    patternCoverageReports: mockCoverageReports,
    tiedCombinationsReports: mockTiedReports,
  });

  const expectedDominantPath = path.join(tmpDir, DominantPatternReportModule.REPORT_FILENAME);
  const expectedCoveragePath = path.join(tmpDir, PatternCoverageReportModule.REPORT_FILENAME);
  const expectedTiedPath = path.join(tmpDir, TiedPatternCombinationsReportModule.REPORT_FILENAME);

  assert.strictEqual(resultPaths.dominantReportPath, expectedDominantPath);
  assert.strictEqual(resultPaths.patternCoverageReportPath, expectedCoveragePath);
  assert.strictEqual(resultPaths.tiedCombinationsReportPath, expectedTiedPath);

  assert.ok(fs.existsSync(expectedDominantPath));
  assert.ok(fs.existsSync(expectedCoveragePath));
  assert.ok(fs.existsSync(expectedTiedPath));

  const parsedDominant = JSON.parse(fs.readFileSync(expectedDominantPath, 'utf-8'));
  assert.ok(Array.isArray(parsedDominant));
  assert.strictEqual(parsedDominant.length, 1);
  assert.strictEqual(parsedDominant[0].reportType, 'dominant-pattern');
  assert.strictEqual(parsedDominant[0].dominantPatterns[0].pattern, 'Error: timeout');

  const parsedCoverage = JSON.parse(fs.readFileSync(expectedCoveragePath, 'utf-8'));
  assert.ok(Array.isArray(parsedCoverage));
  assert.strictEqual(parsedCoverage.length, 1);
  assert.strictEqual(parsedCoverage[0].reportType, 'pattern-coverage');
  assert.strictEqual(parsedCoverage[0].patternCoverage[0].pattern, 'Error: timeout');

  const parsedTied = JSON.parse(fs.readFileSync(expectedTiedPath, 'utf-8'));
  assert.ok(Array.isArray(parsedTied));
  assert.strictEqual(parsedTied.length, 1);
  assert.strictEqual(parsedTied[0].reportType, 'tied-pattern-combinations');
  assert.strictEqual(parsedTied[0].message, 'Nessuna occorrenza con pattern in pareggio rilevata.');
  assert.deepStrictEqual(parsedTied[0].tiedCombinations, []);

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
