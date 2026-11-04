import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Core } from '@go-automation/go-common';
import { exportPatternReports, DEFAULT_REPORT_FILENAME } from '../report.js';
import type { AlarmOccurrencePatternReport } from '../../types/PatternTypes.js';

test('exportPatternReports exports reports array to execution output directory', async () => {
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

  const mockReports: AlarmOccurrencePatternReport[] = [
    {
      profile: 'test-profile',
      alarmName: 'test-alarm',
      totalOccurrences: 1,
      totalPatternsCount: 2,
      occurrences: [
        {
          occurrenceTimestamp: '2026-10-28T17:35:05.731Z',
          queryWindow: {
            start: '2026-10-28T17:33:35.731Z',
            end: '2026-10-28T17:35:35.731Z',
          },
          patternsFound: [
            { pattern: 'Error: timeout', sampleCount: 2, ratio: 1.0 },
          ],
        },
      ],
      patternFrequency: [
        {
          pattern: 'Error: timeout',
          count: 2,
          percentage: 100,
        },
      ],
    },
  ];

  const resultPath = await exportPatternReports(mockScript, mockReports);

  assert.strictEqual(resultPath, path.join(tmpDir, DEFAULT_REPORT_FILENAME));
  assert.ok(fs.existsSync(resultPath));

  const parsed = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
  assert.ok(Array.isArray(parsed));
  assert.strictEqual(parsed.length, 1);
  assert.strictEqual(parsed[0].profile, 'test-profile');
  assert.strictEqual(parsed[0].alarmName, 'test-alarm');
  assert.strictEqual(parsed[0].totalOccurrences, 1);
  assert.strictEqual(parsed[0].totalPatternsCount, 2);
  assert.strictEqual(parsed[0].patternFrequency[0].pattern, 'Error: timeout');
  assert.strictEqual(parsed[0].patternFrequency[0].percentage, 100);

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
