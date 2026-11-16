import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SQS_MAX_BATCH_SIZE, SQS_MAX_PAYLOAD_BYTES, SQSUtils } from '../SQSUtils.js';

describe('SQSUtils', () => {
  it('chunks arrays using SQS-compatible batch sizes', () => {
    assert.deepStrictEqual(SQSUtils.chunkForSQS([1, 2, 3], 2), [[1, 2], [3]]);
    assert.strictEqual(
      SQSUtils.chunkForSQS(
        Array.from({ length: 25 }, (_, index) => index),
        50,
      ).length,
      3,
    );
    assert.strictEqual(SQS_MAX_BATCH_SIZE, 10);
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
