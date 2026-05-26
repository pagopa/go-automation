import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validateConfig } from '../validateConfig.js';
import type { SendMonitorAthenaQueryConfig } from '../../types/index.js';

describe('validateConfig', () => {
  it('rejects legacy threshold field without threshold value', () => {
    assert.throws(
      () => validateConfig(createConfig({ analysisThresholdField: 'total' })),
      /analysis\.threshold\.field and analysis\.threshold must be provided together/,
    );
  });

  it('rejects legacy threshold value without threshold field', () => {
    assert.throws(
      () => validateConfig(createConfig({ analysisThreshold: 100 })),
      /analysis\.threshold\.field and analysis\.threshold must be provided together/,
    );
  });

  it('accepts complete legacy threshold config', () => {
    assert.doesNotThrow(() => validateConfig(createConfig({ analysisThresholdField: 'total', analysisThreshold: 100 })));
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
