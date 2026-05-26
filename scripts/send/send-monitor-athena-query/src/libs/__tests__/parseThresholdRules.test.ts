import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseThresholdRules } from '../parseThresholdRules.js';
import type { SendMonitorAthenaQueryConfig } from '../../types/index.js';

describe('parseThresholdRules', () => {
  it('requires field for default any-row aggregation', () => {
    assert.throws(
      () =>
        parseThresholdRules(
          createConfig({
            analysisRules: ['name=missing-field;operator=>;value=10'],
          }),
        ),
      /analysis\.rules\[0\].*field is required/,
    );
  });

  it('allows count aggregation without field', () => {
    const rules = parseThresholdRules(
      createConfig({
        analysisRules: ['name=row-count;operator=>=;value=10;aggregation=count'],
      }),
    );

    assert.deepStrictEqual(rules, [
      {
        name: 'row-count',
        operator: '>=',
        value: 10,
        aggregation: 'count',
        severity: 'warning',
      },
    ]);
  });

  it('keeps legacy threshold compatibility', () => {
    const rules = parseThresholdRules(
      createConfig({
        analysisRules: [],
        analysisThresholdField: 'total',
        analysisThreshold: 100,
      }),
    );

    assert.deepStrictEqual(rules, [
      {
        name: 'legacy-threshold',
        field: 'total',
        operator: '>',
        value: 100,
        aggregation: 'any-row',
        severity: 'warning',
      },
    ]);
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
