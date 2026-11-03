import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { DispatchTarget } from '../../types/DispatchTarget.js';
import type { SendDispatchNotificationsConfig } from '../../types/SendDispatchNotificationsConfig.js';
import { assertSupportedConfig, effectiveRate, parseDefaults, timelinesProfile } from '../createSessionOptions.js';

const CONFIG: SendDispatchNotificationsConfig = {
  mode: 'e2e',
  inputFile: '/in.csv',
  mappingProfile: 'qa-test',
  listEnvs: false,
  apiVersion: 'v2.6',
  ecClientId: 'pn-cons-000',
  directRequestIdTemplate: 'PNMAN.GO-{runId}.{rowKey}.PCRETRY_0',
  uploadConcurrency: 5,
  preloadBatchSize: 15,
  uploadReuseMaxAge: '72h',
  phases: ['send', 'verify'],
  dryRun: true,
  yes: false,
  failFast: false,
  verbose: false,
  retryFailed: false,
  retryUncertain: false,
  sendRetryAmbiguous: true,
  sendTimeout: '10m',
  rate: 20,
  burst: 1,
  rateAdaptive: true,
  maxInFlight: 40,
  httpTimeout: '60s',
  verifyInitialDelay: '10s',
  verifyTimeout: '15m',
  requestIdCategories: ['PREPARE_ANALOG_DOMICILE', 'PREPARE_DIGITAL_DOMICILE'],
  requestIdSelect: 'per-category',
  requestIdWait: 'any',
  requestIdInitialDelay: '60s',
  requestIdTimeout: '2h',
  dynamodbConcurrency: 10,
  outputIncludeStatus: false,
  outputOnlySuccess: false,
};

const TARGET: DispatchTarget = {
  name: 'ente-test',
  basePath: 'https://api.test.notifichedigitali.it',
  apiKey: 'secret',
  apiKeyLabel: '$K …cret',
  production: false,
  defaults: new Map(),
};

describe('assertSupportedConfig', () => {
  it('accepts the supported combinations', () => {
    assertSupportedConfig(CONFIG);
    assertSupportedConfig({ ...CONFIG, phases: ['request-id'] });
    assertSupportedConfig({ ...CONFIG, inputFile: undefined, resume: 'send-dispatch-notifications_x' });
  });

  it('accepts direct mode with only the send phase and a tunnel URL', () => {
    const direct = { ...CONFIG, mode: 'direct', phases: ['send'], ecBaseUrl: 'http://localhost:8888' };
    assertSupportedConfig(direct);
    assert.throws(() => assertSupportedConfig({ ...direct, phases: ['send', 'verify'] }), /A7/);
    assert.throws(() => assertSupportedConfig({ ...direct, phases: ['send', 'request-id'] }), /template/);
    assert.throws(() => assertSupportedConfig({ ...direct, ecBaseUrl: undefined }), /ec-base-url/);
    assert.throws(
      () => assertSupportedConfig({ ...direct, directRequestIdTemplate: 'X-{iun}' }),
      /unknown placeholder/,
    );
  });

  it('rejects unknown modes, unknown phases and invalid values', () => {
    assert.throws(() => assertSupportedConfig({ ...CONFIG, mode: 'fax' }), /use e2e or direct/);
    assert.throws(() => assertSupportedConfig({ ...CONFIG, phases: ['send', 'publish'] }), /unknown phase/);
    assert.throws(() => assertSupportedConfig({ ...CONFIG, phases: [] }), /at least one phase/);
    assert.throws(() => assertSupportedConfig({ ...CONFIG, apiVersion: 'v3' }), /api-version/);
    assert.throws(() => assertSupportedConfig({ ...CONFIG, requestIdWait: 'some' }), /request-id-wait/);
    assert.throws(() => assertSupportedConfig({ ...CONFIG, inputFile: undefined }), /input-file/);
  });
});

describe('timelinesProfile', () => {
  it('requires --aws-profiles', () => {
    assert.throws(() => timelinesProfile(CONFIG, TARGET), /requires --aws-profiles/);
  });

  it('uses the only profile, or the one of the environment', () => {
    assert.equal(timelinesProfile({ ...CONFIG, awsProfiles: ['sso_a'] }, TARGET), 'sso_a');
    assert.equal(
      timelinesProfile({ ...CONFIG, awsProfiles: ['sso_a', 'sso_b'] }, { ...TARGET, awsProfile: 'sso_b' }),
      'sso_b',
    );
  });

  it('refuses an environment profile missing from --aws-profiles, and ambiguous lists', () => {
    assert.throws(
      () => timelinesProfile({ ...CONFIG, awsProfiles: ['sso_a'] }, { ...TARGET, awsProfile: 'sso_b' }),
      /add it to --aws-profiles/,
    );
    assert.throws(() => timelinesProfile({ ...CONFIG, awsProfiles: ['sso_a', 'sso_b'] }, TARGET), /several profiles/);
  });
});

describe('effectiveRate and parseDefaults', () => {
  it('defaults the rate to 20/s in e2e and 5/s in direct', () => {
    assert.equal(effectiveRate({ ...CONFIG, rate: undefined }), 20);
    assert.equal(effectiveRate({ ...CONFIG, rate: undefined, mode: 'direct' }), 5);
    assert.equal(effectiveRate({ ...CONFIG, rate: 2, mode: 'direct' }), 2);
  });

  it('parses canonical field defaults and rejects typos', () => {
    assert.deepEqual(
      [...parseDefaults(['direct.aar.key = PN_AAR-1.pdf', 'sender.taxId=00000000001'])],
      [
        ['direct.aar.key', 'PN_AAR-1.pdf'],
        ['sender.taxId', '00000000001'],
      ],
    );
    assert.throws(() => parseDefaults(['sender.taxid=1']), /unknown field/);
    assert.throws(() => parseDefaults(['sender.taxId']), /missing value/);
  });
});
