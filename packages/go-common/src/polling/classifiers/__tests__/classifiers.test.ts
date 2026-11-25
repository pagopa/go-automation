import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { GORetryAdvice } from '../../GORetryAdvice.js';
import type { GORetryClassifier } from '../../GORetryClassifier.js';
import type { GORetryDecision } from '../../GORetryDecision.js';
import { awsNetworkClassifier } from '../awsNetworkClassifier.js';
import { awsThrottlingClassifier } from '../awsThrottlingClassifier.js';
import { combineClassifiers, normalizeAdvice } from '../combineClassifiers.js';
import { httpRetryAfterClassifier } from '../httpRetryAfterClassifier.js';
import { httpStatusClassifier } from '../httpStatusClassifier.js';

/** Optional extra fields attached to a test error (AWS/HTTP-like). */
interface ErrorFields {
  readonly name?: string;
  readonly cause?: unknown;
  readonly statusCode?: unknown;
  readonly retryAfterMs?: unknown;
}

/** Builds an Error with the given message and extra fields (mimics AWS SDK / HTTP errors). */
function makeError(message: string, fields: ErrorFields = {}): Error {
  return Object.assign(new Error(message), fields);
}

/** One classification expectation. */
interface ClassifyCase {
  readonly label: string;
  readonly input: unknown;
  readonly expected: GORetryDecision | GORetryAdvice;
}

/** Asserts every case against the classifier. */
function assertClassifies(classifier: GORetryClassifier, cases: ReadonlyArray<ClassifyCase>): void {
  for (const { label, input, expected } of cases) {
    assert.deepStrictEqual(classifier.classify(input), expected, label);
  }
}

describe('awsThrottlingClassifier', () => {
  it('classifies known throttling and transient 5xx error names as retriable', () => {
    for (const name of [
      'ProvisionedThroughputExceededException',
      'ThrottlingException',
      'TooManyRequestsException',
      'LimitExceededException',
      'InternalServerError',
      'ServiceUnavailable',
      'InternalFailure',
      'ServiceFailure',
    ]) {
      assert.strictEqual(awsThrottlingClassifier.classify(makeError('x', { name })), 'retriable', name);
    }
  });

  it('returns unknown (not fatal, to allow composition) for other errors and non-error inputs', () => {
    for (const input of [
      makeError('x', { name: 'ValidationException' }),
      new Error('plain'),
      undefined,
      null,
      'a',
      42,
      {},
    ]) {
      assert.strictEqual(awsThrottlingClassifier.classify(input), 'unknown');
    }
  });
});

describe('awsNetworkClassifier', () => {
  it('classifies network errors by message or nested cause', () => {
    assertClassifies(awsNetworkClassifier, [
      { label: 'ECONNRESET', input: new Error('connect ECONNRESET 1.2.3.4:443'), expected: 'retriable' },
      { label: 'ENOTFOUND', input: new Error('getaddrinfo ENOTFOUND example.com'), expected: 'retriable' },
      { label: 'ETIMEDOUT', input: new Error('socket hang up ETIMEDOUT'), expected: 'retriable' },
      { label: 'UND_ERR', input: new Error('UND_ERR_SOCKET'), expected: 'retriable' },
      {
        label: 'nested cause',
        input: makeError('fetch failed', { cause: new Error('connect ECONNREFUSED') }),
        expected: 'retriable',
      },
      {
        label: 'AbortError is not transient',
        input: makeError('ECONNRESET', { name: 'AbortError' }),
        expected: 'unknown',
      },
      { label: 'unrelated', input: new Error('validation failed'), expected: 'unknown' },
      { label: 'empty message', input: new Error(''), expected: 'unknown' },
      { label: 'null', input: null, expected: 'unknown' },
      { label: 'non-Error object', input: { message: 'ECONNRESET' }, expected: 'unknown' },
    ]);
  });
});

describe('httpStatusClassifier', () => {
  it('maps statusCode to retriable/fatal and anything else to unknown', () => {
    assertClassifies(httpStatusClassifier(new Set([500, 502, 503, 504])), [
      { label: 'retriable status', input: makeError('Bad Gateway', { statusCode: 502 }), expected: 'retriable' },
      { label: 'other status', input: makeError('Bad Request', { statusCode: 400 }), expected: 'fatal' },
      { label: 'no statusCode', input: new Error('no status'), expected: 'unknown' },
      { label: 'non-numeric statusCode', input: makeError('weird', { statusCode: '503' }), expected: 'unknown' },
      { label: 'null', input: null, expected: 'unknown' },
      { label: 'non-Error object', input: { statusCode: 503 }, expected: 'unknown' },
    ]);
  });
});

describe('httpRetryAfterClassifier', () => {
  it('returns retriable with a valid retryAfterMs as delay override, fatal/unknown otherwise', () => {
    assertClassifies(httpRetryAfterClassifier(new Set([429, 503])), [
      {
        label: 'retryAfterMs present',
        input: makeError('Too Many Requests', { statusCode: 429, retryAfterMs: 5000 }),
        expected: { decision: 'retriable', delayMs: 5000 },
      },
      {
        label: 'retryAfterMs missing',
        input: makeError('Service Unavailable', { statusCode: 503 }),
        expected: { decision: 'retriable' },
      },
      {
        label: 'negative retryAfterMs ignored',
        input: makeError('e', { statusCode: 429, retryAfterMs: -100 }),
        expected: { decision: 'retriable' },
      },
      {
        label: 'non-numeric retryAfterMs ignored',
        input: makeError('e', { statusCode: 429, retryAfterMs: 'soon' }),
        expected: { decision: 'retriable' },
      },
      {
        label: 'non-retriable status',
        input: makeError('Bad Request', { statusCode: 400 }),
        expected: { decision: 'fatal' },
      },
      { label: 'no statusCode', input: new Error('plain'), expected: { decision: 'unknown' } },
      { label: 'non-Error object', input: { statusCode: 503 }, expected: { decision: 'unknown' } },
    ]);
  });
});

describe('combineClassifiers', () => {
  it('returns unknown when called with zero classifiers or when all return unknown', () => {
    const unknown: GORetryClassifier = { classify: () => 'unknown' };
    assert.deepStrictEqual(combineClassifiers().classify(new Error('x')), { decision: 'unknown' });
    assert.deepStrictEqual(combineClassifiers(unknown, unknown).classify(new Error('x')), { decision: 'unknown' });
  });

  it('first non-unknown decision wins, preserving its delayMs', () => {
    const chain = combineClassifiers(
      httpRetryAfterClassifier(new Set([429, 503])),
      awsThrottlingClassifier,
      awsNetworkClassifier,
      { classify: () => 'fatal' },
    );

    assertClassifies(chain, [
      {
        label: '503 with delay wins on the first classifier',
        input: makeError('svc', { statusCode: 503, retryAfterMs: 2000 }),
        expected: { decision: 'retriable', delayMs: 2000 },
      },
      {
        label: '400 is fatal from the first classifier',
        input: makeError('bad', { statusCode: 400 }),
        expected: { decision: 'fatal' },
      },
      {
        label: 'throttling wins on the second classifier',
        input: makeError('x', { name: 'ThrottlingException' }),
        expected: { decision: 'retriable' },
      },
      {
        label: 'ECONNRESET wins on the third classifier',
        input: new Error('socket ECONNRESET'),
        expected: { decision: 'retriable' },
      },
      { label: 'falls through to the last classifier', input: new Error('logic bug'), expected: { decision: 'fatal' } },
    ]);
  });
});

describe('normalizeAdvice', () => {
  it('wraps a bare decision string and returns advice objects unchanged', () => {
    assert.deepStrictEqual(normalizeAdvice('retriable'), { decision: 'retriable' });
    const advice = { decision: 'retriable' as const, delayMs: 1500 };
    assert.strictEqual(normalizeAdvice(advice), advice);
  });
});
