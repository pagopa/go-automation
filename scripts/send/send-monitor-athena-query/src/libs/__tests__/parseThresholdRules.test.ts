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

  it('wraps malformed JSON rules with analysis.rules index context', () => {
    assert.throws(
      () =>
        parseThresholdRules(
          createConfig({
            analysisRules: ['{"name":"broken"'],
          }),
        ),
      /Invalid JSON analysis rule at analysis\.rules\[0\]/,
    );
  });

  it('rejects empty numeric values from DSL rules', () => {
    assert.throws(
      () =>
        parseThresholdRules(
          createConfig({
            analysisRules: ['name=empty-value;field=total;operator=>;value='],
          }),
        ),
      /Invalid numeric value for analysis\.rules\[0\]\.value/,
    );
  });

  it('rejects non-string and non-number numeric values from JSON rules', () => {
    assert.throws(
      () =>
        parseThresholdRules(
          createConfig({
            analysisRules: ['{"name":"null-value","field":"total","operator":">","value":null}'],
          }),
        ),
      /Invalid numeric value for analysis\.rules\[0\]\.value/,
    );

    assert.throws(
      () =>
        parseThresholdRules(
          createConfig({
            analysisRules: ['{"name":"boolean-value","field":"total","operator":">","value":true}'],
          }),
        ),
      /Invalid numeric value for analysis\.rules\[0\]\.value/,
    );
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
