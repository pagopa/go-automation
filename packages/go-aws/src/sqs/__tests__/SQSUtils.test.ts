import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SQS_MAX_PAYLOAD_BYTES, SQSUtils } from '../SQSUtils.js';

describe('SQSUtils', () => {
  it('chunks arrays, capping the batch size at the SQS maximum of 10', () => {
    assert.deepStrictEqual(SQSUtils.chunkForSQS([1, 2, 3], 2), [[1, 2], [3]]);
    assert.strictEqual(
      SQSUtils.chunkForSQS(
        Array.from({ length: 25 }, (_, index) => index),
        50,
      ).length,
      3,
    );
  });

  it('validates message payload sizes', () => {
    assert.doesNotThrow(() => SQSUtils.validateMessageSize('message'));
    assert.throws(() => SQSUtils.validateMessageSize(''), /Message body cannot be empty/);
    assert.throws(() => SQSUtils.validateMessageSize('x'.repeat(SQS_MAX_PAYLOAD_BYTES + 1)), /exceeds SQS limit/);
  });

  it('redacts queue account ids from canonical SQS URLs', () => {
    assert.strictEqual(
      SQSUtils.redactQueueUrl('https://sqs.eu-south-1.amazonaws.com/123456789012/my-queue.fifo'),
      'https://sqs.eu-south-1.amazonaws.com/<redacted>/my-queue.fifo',
    );
    assert.strictEqual(SQSUtils.redactQueueUrl('not-a-queue-url'), 'not-a-queue-url');
  });
});
