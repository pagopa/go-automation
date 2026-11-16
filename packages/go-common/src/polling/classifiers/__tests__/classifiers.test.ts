import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { awsNetworkClassifier } from '../awsNetworkClassifier.js';
import { awsThrottlingClassifier } from '../awsThrottlingClassifier.js';
import { combineClassifiers, normalizeAdvice } from '../combineClassifiers.js';
import { httpRetryAfterClassifier } from '../httpRetryAfterClassifier.js';
import { httpStatusClassifier } from '../httpStatusClassifier.js';

/** Builds an Error subclass with the given .name (mimics AWS SDK errors). */
function makeNamedError(name: string, message: string = 'test'): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe('awsThrottlingClassifier', () => {
  it('classifies known AWS throttling errors as retriable', () => {
    assert.strictEqual(
      awsThrottlingClassifier.classify(makeNamedError('ProvisionedThroughputExceededException')),
      'retriable',
    );
    assert.strictEqual(awsThrottlingClassifier.classify(makeNamedError('ThrottlingException')), 'retriable');
    assert.strictEqual(awsThrottlingClassifier.classify(makeNamedError('TooManyRequestsException')), 'retriable');
    assert.strictEqual(awsThrottlingClassifier.classify(makeNamedError('LimitExceededException')), 'retriable');
  });

  it('classifies transient AWS server errors (5xx) as retriable', () => {
    assert.strictEqual(awsThrottlingClassifier.classify(makeNamedError('InternalServerError')), 'retriable');
    assert.strictEqual(awsThrottlingClassifier.classify(makeNamedError('ServiceUnavailable')), 'retriable');
    assert.strictEqual(awsThrottlingClassifier.classify(makeNamedError('InternalFailure')), 'retriable');
    assert.strictEqual(awsThrottlingClassifier.classify(makeNamedError('ServiceFailure')), 'retriable');
  });

  it('returns unknown for non-throttling errors (not fatal — to allow composition)', () => {
    assert.strictEqual(awsThrottlingClassifier.classify(makeNamedError('ValidationException')), 'unknown');
    assert.strictEqual(awsThrottlingClassifier.classify(new Error('plain')), 'unknown');
  });

  it('returns unknown for non-error inputs', () => {
    assert.strictEqual(awsThrottlingClassifier.classify(undefined), 'unknown');
    assert.strictEqual(awsThrottlingClassifier.classify(null), 'unknown');
    assert.strictEqual(awsThrottlingClassifier.classify('a string'), 'unknown');
    assert.strictEqual(awsThrottlingClassifier.classify(42), 'unknown');
    assert.strictEqual(awsThrottlingClassifier.classify({}), 'unknown'); // no .name
  });
});

describe('awsNetworkClassifier', () => {
  it('classifies errors whose message matches network patterns as retriable', () => {
    assert.strictEqual(awsNetworkClassifier.classify(new Error('connect ECONNRESET 1.2.3.4:443')), 'retriable');
    assert.strictEqual(awsNetworkClassifier.classify(new Error('getaddrinfo ENOTFOUND example.com')), 'retriable');
    assert.strictEqual(awsNetworkClassifier.classify(new Error('socket hang up ETIMEDOUT')), 'retriable');
    assert.strictEqual(awsNetworkClassifier.classify(new Error('UND_ERR_SOCKET')), 'retriable');
  });

  it('classifies errors via .cause when the syscall details are nested', () => {
    const inner = new Error('connect ECONNREFUSED');
    const outer = new Error('fetch failed');
    (outer as { cause?: unknown }).cause = inner;
    assert.strictEqual(awsNetworkClassifier.classify(outer), 'retriable');
  });

  it('returns unknown for AbortError (cancellation is not transient)', () => {
    const aborted = new Error('aborted');
    aborted.name = 'AbortError';
    assert.strictEqual(awsNetworkClassifier.classify(aborted), 'unknown');
  });

  it('returns unknown for unrelated errors', () => {
    assert.strictEqual(awsNetworkClassifier.classify(new Error('validation failed')), 'unknown');
    assert.strictEqual(awsNetworkClassifier.classify(new Error('')), 'unknown');
  });

  it('returns unknown for non-error inputs', () => {
    assert.strictEqual(awsNetworkClassifier.classify(undefined), 'unknown');
    assert.strictEqual(awsNetworkClassifier.classify(null), 'unknown');
    assert.strictEqual(awsNetworkClassifier.classify({ message: 'ECONNRESET' }), 'unknown');
  });
});

describe('httpStatusClassifier', () => {
  const classifier = httpStatusClassifier(new Set([500, 502, 503, 504]));

  it('classifies errors with retriable statusCode as retriable', () => {
    const error = new Error('Bad Gateway');
    (error as { statusCode?: number }).statusCode = 502;
    assert.strictEqual(classifier.classify(error), 'retriable');
  });

  it('classifies errors with non-retriable statusCode as fatal', () => {
    const error = new Error('Bad Request');
    (error as { statusCode?: number }).statusCode = 400;
    assert.strictEqual(classifier.classify(error), 'fatal');
  });

  it('returns unknown when no statusCode is present', () => {
    assert.strictEqual(classifier.classify(new Error('no status')), 'unknown');
  });

  it('returns unknown for non-error inputs', () => {
    assert.strictEqual(classifier.classify(null), 'unknown');
    assert.strictEqual(classifier.classify({ statusCode: 503 }), 'unknown');
  });

  it('returns unknown when statusCode is not a number', () => {
    const error = new Error('weird');
    (error as { statusCode?: unknown }).statusCode = '503';
    assert.strictEqual(classifier.classify(error), 'unknown');
  });
});

describe('httpRetryAfterClassifier', () => {
  const classifier = httpRetryAfterClassifier(new Set([429, 503]));

  it('returns retriable with delayMs when retryAfterMs is present', () => {
    const error = new Error('Too Many Requests');
    (error as { statusCode?: number; retryAfterMs?: number }).statusCode = 429;
    (error as { statusCode?: number; retryAfterMs?: number }).retryAfterMs = 5000;
    assert.deepStrictEqual(classifier.classify(error), { decision: 'retriable', delayMs: 5000 });
  });

  it('returns retriable without delayMs when retryAfterMs is missing', () => {
    const error = new Error('Service Unavailable');
    (error as { statusCode?: number }).statusCode = 503;
    assert.deepStrictEqual(classifier.classify(error), { decision: 'retriable' });
  });

  it('returns fatal for non-retriable statuses', () => {
    const error = new Error('Bad Request');
    (error as { statusCode?: number }).statusCode = 400;
    assert.deepStrictEqual(classifier.classify(error), { decision: 'fatal' });
  });

  it('returns unknown when no statusCode is present', () => {
    assert.deepStrictEqual(classifier.classify(new Error('plain')), { decision: 'unknown' });
  });

  it('ignores invalid retryAfterMs values (negative or non-number)', () => {
    const e1 = new Error('e');
    (e1 as { statusCode?: number; retryAfterMs?: number }).statusCode = 429;
    (e1 as { statusCode?: number; retryAfterMs?: number }).retryAfterMs = -100;
    assert.deepStrictEqual(classifier.classify(e1), { decision: 'retriable' }, 'negative ignored');

    const e2 = new Error('e');
    (e2 as { statusCode?: number; retryAfterMs?: unknown }).statusCode = 429;
    (e2 as { statusCode?: number; retryAfterMs?: unknown }).retryAfterMs = 'soon';
    assert.deepStrictEqual(classifier.classify(e2), { decision: 'retriable' }, 'non-number ignored');
  });

  it('returns unknown for non-error inputs', () => {
    assert.deepStrictEqual(classifier.classify(null), { decision: 'unknown' });
    assert.deepStrictEqual(classifier.classify({ statusCode: 503 }), { decision: 'unknown' });
  });
});

describe('combineClassifiers', () => {
  it('returns first non-unknown decision (first-match-wins)', () => {
    const first = { classify: (): 'retriable' => 'retriable' };
    const second = { classify: (): 'fatal' => 'fatal' };
    const combined = combineClassifiers(first, second);
    assert.deepStrictEqual(combined.classify(new Error('x')), { decision: 'retriable' });
  });

  it('skips classifiers that return unknown', () => {
    const first = { classify: (): 'unknown' => 'unknown' };
    const second = { classify: (): 'retriable' => 'retriable' };
    const combined = combineClassifiers(first, second);
    assert.deepStrictEqual(combined.classify(new Error('x')), { decision: 'retriable' });
  });

  it('returns unknown when all classifiers return unknown', () => {
    const combined = combineClassifiers({ classify: () => 'unknown' as const }, { classify: () => 'unknown' as const });
    assert.deepStrictEqual(combined.classify(new Error('x')), { decision: 'unknown' });
  });

  it('preserves delayMs from the winning classifier', () => {
    const winner = httpRetryAfterClassifier(new Set([429]));
    const fallback = awsNetworkClassifier;
    const combined = combineClassifiers(winner, fallback);

    const error = new Error('rate limited');
    (error as { statusCode?: number; retryAfterMs?: number }).statusCode = 429;
    (error as { statusCode?: number; retryAfterMs?: number }).retryAfterMs = 3000;

    assert.deepStrictEqual(combined.classify(error), { decision: 'retriable', delayMs: 3000 });
  });

  it('returns unknown when called with zero classifiers', () => {
    const combined = combineClassifiers();
    assert.deepStrictEqual(combined.classify(new Error('x')), { decision: 'unknown' });
  });

  it('realistic chain: httpRetryAfter + throttling + network', () => {
    const chain = combineClassifiers(
      httpRetryAfterClassifier(new Set([429, 503])),
      awsThrottlingClassifier,
      awsNetworkClassifier,
    );

    // 503 with delay → wins on first
    const e1 = new Error('svc');
    (e1 as { statusCode?: number; retryAfterMs?: number }).statusCode = 503;
    (e1 as { statusCode?: number; retryAfterMs?: number }).retryAfterMs = 2000;
    assert.deepStrictEqual(chain.classify(e1), { decision: 'retriable', delayMs: 2000 });

    // throttling exception (no status) → wins on second
    assert.deepStrictEqual(chain.classify(makeNamedError('ThrottlingException')), { decision: 'retriable' });

    // ECONNRESET → wins on third
    assert.deepStrictEqual(chain.classify(new Error('socket ECONNRESET')), { decision: 'retriable' });

    // Unrelated → all unknown
    assert.deepStrictEqual(chain.classify(new Error('logic bug')), { decision: 'unknown' });

    // 400 with no Retry-After → fatal from first
    const e2 = new Error('bad');
    (e2 as { statusCode?: number }).statusCode = 400;
    assert.deepStrictEqual(chain.classify(e2), { decision: 'fatal' });
  });
});

describe('normalizeAdvice', () => {
  it('wraps a bare GORetryDecision string in an advice object', () => {
    assert.deepStrictEqual(normalizeAdvice('retriable'), { decision: 'retriable' });
    assert.deepStrictEqual(normalizeAdvice('fatal'), { decision: 'fatal' });
    assert.deepStrictEqual(normalizeAdvice('unknown'), { decision: 'unknown' });
  });

  it('returns existing advice objects unchanged', () => {
    const advice = { decision: 'retriable' as const, delayMs: 1500 };
    assert.strictEqual(normalizeAdvice(advice), advice);
  });
});
