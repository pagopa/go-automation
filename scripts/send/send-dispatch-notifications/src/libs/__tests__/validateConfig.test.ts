import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Core } from '@go-automation/go-common';

import { DispatchUsageError } from '../DispatchUsageError.js';
import { parseDurations, validateConfig } from '../validateConfig.js';
import { RAW_CONFIG } from './helpers/testScript.js';

const DIRECT = { ...RAW_CONFIG, mode: 'direct', phases: ['send'], ecBaseUrl: 'http://localhost:8888/' };

describe('validateConfig', () => {
  it('accepts the supported combinations and narrows the literal types', () => {
    const config = validateConfig(RAW_CONFIG);
    assert.equal(config.mode, 'e2e');
    assert.equal(config.apiVersion, 'v2.6');
    assert.deepEqual(config.phases, ['send', 'verify']);
    assert.equal(config.requestIdSelect, 'per-category');
    validateConfig({ ...RAW_CONFIG, phases: ['request-id'] });
    validateConfig({ ...RAW_CONFIG, inputFile: undefined, resume: 'send-dispatch-notifications_x' });
  });

  it('accepts direct mode with only the send phase and a tunnel URL with scheme', () => {
    const config = validateConfig(DIRECT);
    assert.equal(config.mode, 'direct');
    if (config.mode !== 'direct') return;
    assert.equal(config.ecBaseUrl, 'http://localhost:8888');
    assert.equal(config.requestIdTemplate.template, 'PNMAN.GO-{runId}.{rowKey}.PCRETRY_0');
    assert.equal(config.ecProduction, false);
    assert.equal(validateConfig({ ...DIRECT, ecProduction: true }).ecProduction, true);
  });

  it('rejects the direct combinations that are not supported', () => {
    assert.throws(() => validateConfig({ ...DIRECT, phases: ['send', 'verify'] }), /A7/);
    assert.throws(() => validateConfig({ ...DIRECT, phases: ['send', 'request-id'] }), /template/);
    assert.throws(() => validateConfig({ ...DIRECT, ecBaseUrl: undefined }), /ec-base-url/);
    assert.throws(() => validateConfig({ ...DIRECT, ecBaseUrl: 'localhost:8888' }), /include the scheme/);
    assert.throws(() => validateConfig({ ...DIRECT, directRequestIdTemplate: 'X-{iun}' }), /unknown placeholder/);
    assert.throws(() => validateConfig({ ...DIRECT, directRequestIdTemplate: 'X-{runId}' }), DispatchUsageError);
    assert.throws(() => validateConfig({ ...RAW_CONFIG, ecProduction: true }), /only to --mode direct/);
  });

  it('rejects unknown modes, phases, formats and enumeration values with a usage error', () => {
    assert.throws(() => validateConfig({ ...RAW_CONFIG, mode: 'fax' }), /use e2e or direct/);
    assert.throws(() => validateConfig({ ...RAW_CONFIG, phases: ['send', 'publish'] }), /unknown phase/);
    assert.throws(() => validateConfig({ ...RAW_CONFIG, phases: [] }), /at least one phase/);
    assert.throws(() => validateConfig({ ...RAW_CONFIG, apiVersion: 'v3' }), /api-version/);
    assert.throws(() => validateConfig({ ...RAW_CONFIG, requestIdSelect: 'first' }), /request-id-select/);
    assert.throws(() => validateConfig({ ...RAW_CONFIG, requestIdWait: 'some' }), /request-id-wait/);
    assert.throws(() => validateConfig({ ...RAW_CONFIG, inputFile: undefined }), /input-file/);
    assert.throws(() => validateConfig({ ...RAW_CONFIG, inputFormat: 'xlsx' }), /--input-format xlsx/);
    assert.throws(() => validateConfig({ ...RAW_CONFIG, outputFormat: 'xml' }), /--output-format xml/);
    assert.throws(() => validateConfig({ ...RAW_CONFIG, defaults: ['sender.taxid=1'] }), DispatchUsageError);
  });

  it('parses --defaults into field values', () => {
    const config = validateConfig({ ...RAW_CONFIG, defaults: ['sender.denomination=Comune di X', 'Ufficio Y'] });
    assert.equal(config.fieldDefaults.get('sender.denomination'), 'Comune di X, Ufficio Y');
  });
});

describe('parseDurations', () => {
  it('parses the defaults', () => {
    assert.deepEqual(parseDurations(RAW_CONFIG), {
      httpTimeoutMs: 60_000,
      sendTimeoutMs: 600_000,
      verifyInitialDelayMs: 10_000,
      verifyTimeoutMs: 900_000,
      requestIdInitialDelayMs: 60_000,
      requestIdTimeoutMs: 7_200_000,
      uploadReuseMaxAgeMs: 72 * 3_600_000,
    });
  });

  it('rejects zero timers and timers beyond the setTimeout maximum, naming the parameter', () => {
    assert.throws(() => parseDurations({ ...RAW_CONFIG, sendTimeout: '0s' }), /send\.timeout.*minimum of 1 ms/);
    assert.throws(() => parseDurations({ ...RAW_CONFIG, httpTimeout: '0ms' }), /http\.timeout/);
    assert.throws(() => parseDurations({ ...RAW_CONFIG, verifyInitialDelay: '0s' }), /verify\.initial\.delay/);
    assert.throws(() => parseDurations({ ...RAW_CONFIG, requestIdTimeout: '30d' }), /request\.id\.timeout.*maximum/);
    assert.throws(() => parseDurations({ ...RAW_CONFIG, verifyTimeout: '15 m' }), DispatchUsageError);
  });

  it('treats upload.reuse.max.age as an age: 0 and values beyond the setTimeout maximum are allowed', () => {
    assert.equal(parseDurations({ ...RAW_CONFIG, uploadReuseMaxAge: '0s' }).uploadReuseMaxAgeMs, 0);
    const longAge = parseDurations({ ...RAW_CONFIG, uploadReuseMaxAge: '30d' }).uploadReuseMaxAgeMs;
    assert.ok(longAge > Core.SET_TIMEOUT_MAX_MS);
  });
});
