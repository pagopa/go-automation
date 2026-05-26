import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { Core } from '@go-automation/go-common';

import { writeResultArtifact } from '../writeResultArtifact.js';
import type { SendMonitorAthenaQueryConfig } from '../../types/index.js';

describe('writeResultArtifact', () => {
  it('sanitizes file prefix without regex trimming', async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'athena-artifact-'));

    try {
      const artifact = await writeResultArtifact(
        [{ id: '1' }],
        createConfig({
          outputFolder: outputDir,
          outputFilePrefix: '---bad prefix !! name---',
        }),
        new Core.GOPaths({ scriptName: 'send-monitor-athena-query', baseDir: outputDir }),
      );

      assert.match(artifact.fileName, /^bad-prefix-name_/);
      assert.strictEqual(path.dirname(artifact.filePath), outputDir);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});

function createConfig(overrides: Partial<SendMonitorAthenaQueryConfig> = {}): SendMonitorAthenaQueryConfig {
  return {
    timeLookbackHours: 24,
    timeZone: 'Europe/Rome',
    awsRegion: 'eu-south-1',
    athenaDatabase: 'db',
    athenaCatalog: 'AwsDataCatalog',
    athenaWorkgroup: 'primary',
    athenaOutputLocation: 's3://bucket/prefix/',
    athenaQuery: 'select 1',
    athenaMaxPollAttempts: 60,
    athenaPollIntervalMs: 5000,
    templateParams: [],
    templateRaw: [],
    templateLegacyAliases: true,
    outputFolder: 'reports',
    outputFormat: 'csv',
    outputFilePrefix: 'athena-report',
    outputAttachWhenEmpty: false,
    slackMessageTemplate: 'report',
    slackSendOnEmpty: true,
    slackSendOnError: true,
    analysisRules: [],
    ...overrides,
  };
}
