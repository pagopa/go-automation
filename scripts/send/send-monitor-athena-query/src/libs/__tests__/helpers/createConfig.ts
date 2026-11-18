import type { SendMonitorAthenaQueryConfig } from '../../../types/index.js';

/**
 * Builds a complete, valid script configuration for the tests.
 *
 * @param overrides - Fields replacing the defaults
 * @returns The configuration
 */
export function createConfig(overrides: Partial<SendMonitorAthenaQueryConfig> = {}): SendMonitorAthenaQueryConfig {
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
