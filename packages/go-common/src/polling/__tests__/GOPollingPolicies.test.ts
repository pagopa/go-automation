import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOPollingPolicies } from '../GOPollingPolicies.js';
import { normalizeAdvice } from '../classifiers/combineClassifiers.js';

/** Builds an error carrying the given name and optional HTTP-like fields. */
function makeError(name: string, fields: { readonly statusCode?: number; readonly retryAfterMs?: number } = {}): Error {
  const error = new Error(name);
  error.name = name;
  return Object.assign(error, fields);
}

describe('GOPollingPolicies', () => {
  it('every preset returns a fresh object on each call', () => {
    for (const [name, factory] of Object.entries(GOPollingPolicies)) {
      assert.notStrictEqual(factory(), factory(), `${name} returned the same reference twice`);
    }
  });

  const pollingPresets = [
    { name: 'athenaQuery', maxAttempts: 120, delays: [500, 1000, 3000] },
    { name: 'cloudWatchLogsQuery', maxAttempts: 60, delays: [500, 1000, 5000] },
    { name: 'sendIunPolling', maxAttempts: 8, delays: [30000, 30000, 30000] },
  ] as const;
  for (const { name, maxAttempts, delays } of pollingPresets) {
    it(`${name}: ${String(maxAttempts)} attempts, delays ${delays.join('/')} at attempts 0/1/10`, () => {
      const policy = GOPollingPolicies[name]();
      assert.strictEqual(policy.maxAttempts, maxAttempts);
      assert.deepStrictEqual(
        [0, 1, 10].map((attempt) => policy.backoff?.({ attempt })),
        [...delays],
      );
    });
  }

  const retryPresets = [
    {
      name: 'awsThrottling',
      maxAttempts: 5,
      unknownDecision: 'fatal',
      maxDelayAt10: 4999,
      classified: [
        { error: makeError('ThrottlingException'), advice: { decision: 'retriable' } },
        { error: makeError('Error', { statusCode: 400 }), advice: { decision: 'unknown' } },
      ],
    },
    {
      name: 'httpDownload',
      maxAttempts: 4,
      unknownDecision: 'fatal',
      maxDelayAt10: 29997,
      classified: [
        {
          error: makeError('Error', { statusCode: 503, retryAfterMs: 4000 }),
          advice: { decision: 'retriable', delayMs: 4000 },
        },
        { error: makeError('Error', { statusCode: 400 }), advice: { decision: 'fatal' } },
      ],
    },
    {
      name: 'sqsBatchSend',
      maxAttempts: 3,
      unknownDecision: 'retriable',
      maxDelayAt10: 1999,
      classified: [{ error: makeError('RequestLimitExceeded'), advice: { decision: 'retriable' } }],
    },
  ] as const;
  for (const { name, maxAttempts, unknownDecision, maxDelayAt10, classified } of retryPresets) {
    it(`${name}: ${String(maxAttempts)} attempts, jittered backoff, unknownDecision=${unknownDecision}`, (t) => {
      t.mock.method(Math, 'random', () => 0.9999);
      const policy = GOPollingPolicies[name]();
      assert.strictEqual(policy.maxAttempts, maxAttempts);
      assert.strictEqual(policy.unknownDecision, unknownDecision);
      assert.strictEqual(policy.backoff?.({ attempt: 10 }), maxDelayAt10, 'jitter bounded by the cap');
      for (const { error, advice } of classified) {
        const actual = policy.classifier?.classify(error);
        assert.ok(actual !== undefined);
        assert.deepStrictEqual(normalizeAdvice(actual), advice);
      }
    });
  }
});
