import type { ImportBudget } from './types/ImportBudget.js';

const NO_SDK: ReadonlyArray<string> = ['@aws-sdk/', '@smithy/'];
const PILOT_FORBIDDEN: ReadonlyArray<string> = [
  '@aws-sdk/client-ec2',
  '@inquirer/',
  'better-sqlite3',
  '@go-automation/go-script',
  '@go-automation/go-send',
];

/**
 * Budgets of EVO-PKGPUB-OPUS-01 §10.4 (amendment r14). The deterministic assertions on the module
 * graph are the real guarantee; the times are wide thresholds.
 */
export const IMPORT_BUDGETS: ReadonlyArray<ImportBudget> = [
  { specifiers: ['@pagopa/go-common/utils'], maxMilliseconds: 10, allowedThirdParty: [] },
  ...['errors', 'json', 'events', 'polling', 'concurrency', 'process'].map((area): ImportBudget => ({
    specifiers: [`@pagopa/go-common/${area}`],
    maxMilliseconds: 15,
    allowedThirdParty: [],
  })),
  { specifiers: ['@pagopa/go-common/dates'], maxMilliseconds: 15, allowedThirdParty: ['luxon'] },
  { specifiers: ['@pagopa/go-common/logging'], maxMilliseconds: 50, forbidden: ['undici', ...NO_SDK] },
  { specifiers: ['@pagopa/go-aws/cloudwatch-logs/insights'], maxMilliseconds: 5, forbidden: NO_SDK },
  {
    specifiers: ['@pagopa/go-aws/s3'],
    maxMilliseconds: 80,
    onlySdkClients: ['@aws-sdk/client-s3', '@aws-sdk/client-sts'],
  },
  { specifiers: ['@pagopa/go-runbook'], maxMilliseconds: 60, forbidden: ['undici', ...NO_SDK] },
  { specifiers: ['@pagopa/go-runbook/output'], maxMilliseconds: 30, forbidden: NO_SDK },
  { specifiers: ['@pagopa/go-runbook/toolkits/common'], maxMilliseconds: 150, forbidden: NO_SDK },
  { specifiers: ['@pagopa/go-runbook/toolkits/send'], maxMilliseconds: 150, forbidden: NO_SDK },
  { specifiers: ['@pagopa/go-runbook/toolkits/interop'], maxMilliseconds: 150, forbidden: NO_SDK },
  { specifiers: ['@pagopa/go-runbook/inventory'], maxMilliseconds: 350, forbidden: NO_SDK },
  {
    specifiers: ['@pagopa/go-runbook/inventory', '@pagopa/go-runbook/runtime'],
    maxMilliseconds: 350,
    forbidden: PILOT_FORBIDDEN,
    noNativeModules: true,
  },
];
