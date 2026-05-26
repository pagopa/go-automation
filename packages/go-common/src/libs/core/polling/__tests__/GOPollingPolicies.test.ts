import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOPollingPolicies } from '../GOPollingPolicies.js';

describe('GOPollingPolicies', () => {
  describe('factory purity', () => {
    it('every preset returns a fresh POJO on each call', () => {
      const presetNames = [
        'athenaQuery',
        'cloudWatchLogsQuery',
        'sendIunPolling',
        'awsThrottling',
        'httpDownload',
        'sqsBatchSend',
      ] as const;

      for (const name of presetNames) {
        const factory = GOPollingPolicies[name];
        const first = factory();
        const second = factory();
        assert.notStrictEqual(first, second, `${name} returned the same reference twice`);
      }
    });

    it('mutating a preset result does not affect later calls', () => {
      // Defensive against accidental mutation by consumers spreading + extending.
      const first = GOPollingPolicies.athenaQuery();
      (first as { maxAttempts: number }).maxAttempts = 999;

      const second = GOPollingPolicies.athenaQuery();
      assert.strictEqual(second.maxAttempts, 120, 'second call sees the documented default');
    });
  });

  describe('polling presets snapshots', () => {
    it('athenaQuery: 120 attempts, exponential 500→3000ms', () => {
      const policy = GOPollingPolicies.athenaQuery();
      assert.strictEqual(policy.maxAttempts, 120);
      assert.ok(typeof policy.backoff === 'function', 'backoff is a function');
      assert.strictEqual(policy.backoff?.({ attempt: 0 }), 500);
      assert.strictEqual(policy.backoff?.({ attempt: 1 }), 1000);
      assert.strictEqual(policy.backoff?.({ attempt: 10 }), 3000, 'cap reached');
    });

    it('cloudWatchLogsQuery: 60 attempts, exponential 500→5000ms', () => {
      const policy = GOPollingPolicies.cloudWatchLogsQuery();
      assert.strictEqual(policy.maxAttempts, 60);
      assert.strictEqual(policy.backoff?.({ attempt: 0 }), 500);
      assert.strictEqual(policy.backoff?.({ attempt: 3 }), 4000);
      assert.strictEqual(policy.backoff?.({ attempt: 10 }), 5000, 'cap reached');
    });

    it('sendIunPolling: 8 attempts, constant 30000ms', () => {
      const policy = GOPollingPolicies.sendIunPolling();
      assert.strictEqual(policy.maxAttempts, 8);
      assert.strictEqual(policy.backoff?.({ attempt: 0 }), 30000);
      assert.strictEqual(policy.backoff?.({ attempt: 7 }), 30000);
    });
  });

  describe('retry presets snapshots', () => {
    it('awsThrottling: 5 attempts, exponentialJittered 100→5000ms, classifier + unknownDecision=fatal', (t) => {
      const policy = GOPollingPolicies.awsThrottling();
      assert.strictEqual(policy.maxAttempts, 5);
      assert.strictEqual(policy.unknownDecision, 'fatal');
      assert.ok(typeof policy.backoff === 'function');
      assert.ok(typeof policy.classifier?.classify === 'function');

      // Backoff jittered: with Math.random=0, returns 0.
      t.mock.method(Math, 'random', () => 0);
      assert.strictEqual(policy.backoff?.({ attempt: 0 }), 0);

      // Classifier recognises a known AWS throttling error.
      const throttlingError = new Error('throttled');
      throttlingError.name = 'ThrottlingException';
      const advice = policy.classifier?.classify(throttlingError);
      assert.ok(advice !== undefined);
      const decision = typeof advice === 'string' ? advice : advice.decision;
      assert.strictEqual(decision, 'retriable');
    });

    it('httpDownload: 4 attempts, exponentialJittered 500→30000ms, classifier handles 429/5xx with retryAfter', () => {
      const policy = GOPollingPolicies.httpDownload();
      assert.strictEqual(policy.maxAttempts, 4);
      assert.strictEqual(policy.unknownDecision, 'fatal');

      // Classifier recognises a 503 with retryAfterMs.
      const error = new Error('Service Unavailable');
      (error as { statusCode?: number; retryAfterMs?: number }).statusCode = 503;
      (error as { statusCode?: number; retryAfterMs?: number }).retryAfterMs = 4000;
      const advice = policy.classifier?.classify(error);
      assert.ok(advice !== undefined && typeof advice !== 'string');
      assert.strictEqual(advice.decision, 'retriable');
      assert.strictEqual(advice.delayMs, 4000, 'Retry-After propagated as delay override');
    });

    it('httpDownload classifier returns fatal for non-retriable HTTP statuses (e.g. 400)', () => {
      const policy = GOPollingPolicies.httpDownload();
      const error = new Error('Bad Request');
      (error as { statusCode?: number }).statusCode = 400;
      const advice = policy.classifier?.classify(error);
      assert.ok(advice !== undefined && typeof advice !== 'string');
      assert.strictEqual(advice.decision, 'fatal');
    });

    it('sqsBatchSend: 3 attempts, exponentialJittered 200→2000ms, unknownDecision=retriable', () => {
      const policy = GOPollingPolicies.sqsBatchSend();
      assert.strictEqual(policy.maxAttempts, 3);
      assert.strictEqual(
        policy.unknownDecision,
        'retriable',
        'SQS Failed entries are usually transient, defer to retry by default',
      );

      // Classifier recognises throttling.
      const error = new Error('limit');
      error.name = 'RequestLimitExceeded';
      const advice = policy.classifier?.classify(error);
      const decision = typeof advice === 'string' ? advice : advice?.decision;
      assert.strictEqual(decision, 'retriable');
    });
  });
});
