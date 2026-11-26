import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import type { GOScript } from '@go-automation/go-script';
import { GOLogger } from '@pagopa/go-common/logging';
import type { Runbook, RunbookExecutionTrace } from '@pagopa/go-runbook';

import { analyzeOccurrence } from '../analyzeOccurrence.js';
import type { AnalyzableAlarmConfig } from '../../types/AnalyzableAlarmConfig.js';

describe('analyzeOccurrence', () => {
  it('uses the configured AWS client region in both runbook params and execution trace', async (t) => {
    const outputDir = await mkdtemp(join(tmpdir(), 'go-analyze-alarm-region-'));
    t.after(async () => rm(outputDir, { recursive: true, force: true }));

    const logger = new GOLogger();
    const script = {
      logger,
      aws: {
        clients: {
          first: { getRegion: () => 'eu-west-1' },
          profileNames: ['sso_example'],
        },
        services: { cloudWatchLogs: {}, cloudWatchMetrics: {}, athena: {}, dynamoDB: {} },
      },
      paths: { resolvePathWithInfo: (fileName: string) => ({ path: join(outputDir, fileName) }) },
    } as unknown as GOScript;
    const config: AnalyzableAlarmConfig = {
      analysisMode: 'single',
      alarmName: 'example-alarm',
      alarmDatetime: '2026-09-28T10:00:00.000Z',
      awsProfiles: ['sso_example'],
      statsDetail: true,
      statsSave: false,
      outputTrace: true,
      outputResult: true,
    };
    const runbook: Runbook = {
      metadata: {
        id: 'example-runbook',
        name: 'Example Runbook',
        description: 'Region regression test',
        version: '1.0.0',
        type: 'alarm-resolution',
        team: 'GO',
        tags: [],
      },
      steps: [],
      knownCases: [],
      fallbackAction: { type: 'log', level: 'info', title: 'No known case' },
    };

    await analyzeOccurrence(script, config, () => runbook, { alarmDatetime: config.alarmDatetime });

    // This file is created by the runbook inside the test-owned temporary directory.
    const tracePath = join(outputDir, 'trace-example-alarm.json');
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const traceContent = await readFile(tracePath, 'utf8');
    const trace = JSON.parse(traceContent) as RunbookExecutionTrace;
    assert.strictEqual(trace.input['awsRegion'], 'eu-west-1');
    assert.strictEqual(trace.execution.environment.region, 'eu-west-1');
  });

  it('saves only the files asked for: the trace and the result each by its own parameter', async (t) => {
    for (const [outputTrace, outputResult] of [
      [true, true],
      [true, false],
      [false, true],
      [false, false],
    ] as const) {
      const outputDir = await mkdtemp(join(tmpdir(), 'go-analyze-alarm-output-'));
      t.after(async () => rm(outputDir, { recursive: true, force: true }));
      const script = {
        logger: new GOLogger(),
        aws: {
          clients: { first: { getRegion: () => 'eu-west-1' }, profileNames: ['sso_example'] },
          services: { cloudWatchLogs: {}, cloudWatchMetrics: {}, athena: {}, dynamoDB: {} },
        },
        paths: { resolvePathWithInfo: (fileName: string) => ({ path: join(outputDir, fileName) }) },
      } as unknown as GOScript;
      const config: AnalyzableAlarmConfig = {
        analysisMode: 'single',
        alarmName: 'example-alarm',
        alarmDatetime: '2026-09-28T10:00:00.000Z',
        awsProfiles: ['sso_example'],
        statsDetail: true,
        statsSave: false,
        outputTrace,
        outputResult,
      };
      const runbook: Runbook = {
        metadata: {
          id: 'example-runbook',
          name: 'Example Runbook',
          description: 'Output files',
          version: '1.0.0',
          type: 'alarm-resolution',
          team: 'GO',
          tags: [],
        },
        steps: [],
        knownCases: [],
        fallbackAction: { type: 'log', level: 'info', title: 'No known case' },
      };

      await analyzeOccurrence(script, config, () => runbook, { alarmDatetime: config.alarmDatetime });

      // This directory is created by the test.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const files = (await readdir(outputDir)).sort();
      assert.deepStrictEqual(files, [
        ...(outputResult ? ['result-example-runbook.json'] : []),
        ...(outputTrace ? ['trace-example-alarm.json'] : []),
      ]);
    }
  });
});
