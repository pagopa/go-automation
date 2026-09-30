import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { Core } from '@go-automation/go-common';
import type { Runbook, RunbookExecutionTrace } from '@go-automation/go-runbook';

import { analyzeOccurrence } from '../analyzeOccurrence.js';
import type { AnalyzableAlarmConfig } from '../../types/AnalyzableAlarmConfig.js';

describe('analyzeOccurrence', () => {
  it('uses the configured AWS client region in both runbook params and execution trace', async (t) => {
    const outputDir = await mkdtemp(join(tmpdir(), 'go-analyze-alarm-region-'));
    t.after(async () => rm(outputDir, { recursive: true, force: true }));

    const logger = new Core.GOLogger();
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
    } as unknown as Core.GOScript;
    const config: AnalyzableAlarmConfig = {
      analysisMode: 'single',
      alarmName: 'example-alarm',
      alarmDatetime: '2026-09-28T10:00:00.000Z',
      awsProfiles: ['sso_example'],
      statsDetail: true,
      statsSave: false,
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
});
