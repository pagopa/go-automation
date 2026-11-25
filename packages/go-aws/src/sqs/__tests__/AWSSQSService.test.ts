import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DeleteMessageBatchCommand,
  ReceiveMessageCommand,
  SendMessageBatchCommand,
  type Message,
  type SQSClient,
} from '@aws-sdk/client-sqs';
import type { CloudWatchClient } from '@aws-sdk/client-cloudwatch';

import { FakeAwsClient } from '../../__tests__/helpers/FakeAwsClient.js';
import { AWSSQSService } from '../AWSSQSService.js';
import type { SQSMoveOptions } from '../models/SQSMoveOptions.js';

const SOURCE = 'https://sqs.eu-south-1.amazonaws.com/123456789012/source';

/** Move options shared by the tests: one worker, stop at the first empty poll. */
const MOVE: SQSMoveOptions = {
  sourceQueueUrl: SOURCE,
  targetQueueUrl: 'https://sqs.eu-south-1.amazonaws.com/123456789012/target',
  isFifo: false,
  visibilityTimeout: 60,
  batchSize: 10,
  dryRun: false,
  maxEmptyReceives: 1,
};

function createService(sqs: FakeAwsClient): AWSSQSService {
  return new AWSSQSService(sqs.as<SQSClient>(), new FakeAwsClient(() => ({})).as<CloudWatchClient>());
}

function message(id: string, overrides: Partial<Message> = {}): Message {
  return { MessageId: id, ReceiptHandle: `receipt-${id}`, Body: `body-${id}`, ...overrides };
}

describe('AWSSQSService', () => {
  it('aggregates successful send ids across retries', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const sqs = new FakeAwsClient([
      { Successful: [{ Id: 'msg-0' }], Failed: [{ Id: 'msg-1', Code: 'Throttled', Message: 'try again' }] },
      { Successful: [{ Id: 'msg-1' }], Failed: [] },
    ]);

    const pending = createService(sqs).sendMessageBatchWithRetries(
      SOURCE,
      [
        { Id: 'msg-0', MessageBody: 'ok-first' },
        { Id: 'msg-1', MessageBody: 'ok-retry' },
      ],
      { maxRetries: 1 },
    );
    // The first batch settles on microtasks; then the backoff timer is pending.
    await new Promise<void>((resolve) => setImmediate(resolve));
    t.mock.timers.runAll();
    const result = await pending;

    assert.deepStrictEqual(result.Successful?.map((entry) => entry.Id).sort(), ['msg-0', 'msg-1']);
    assert.deepStrictEqual(result.Failed, []);
    assert.deepStrictEqual(
      sqs.inputs(SendMessageBatchCommand).map((input) => input['Entries']),
      [
        [
          { Id: 'msg-0', MessageBody: 'ok-first' },
          { Id: 'msg-1', MessageBody: 'ok-retry' },
        ],
        [{ Id: 'msg-1', MessageBody: 'ok-retry' }],
      ],
    );
  });

  it('classifies delete failures as duplicate risk after a successful send', async () => {
    const sqs = new FakeAwsClient([
      { Messages: [message('a')] },
      { Successful: [{ Id: 'msg-0' }], Failed: [] },
      { Successful: [], Failed: [{ Id: 'msg-0', Code: 'InternalError', Message: 'delete failed' }] },
      { Messages: [] },
    ]);

    const result = await createService(sqs).moveMessages(MOVE);

    assert.strictEqual(result.totalMoved, 0);
    assert.strictEqual(result.totalDeleteFailed, 1);
    assert.strictEqual(result.totalFailed, 1);
    assert.strictEqual(result.errors[0]?.stage, 'delete');
    assert.match(result.errors[0]?.error ?? '', /duplicate at risk/i);
  });

  it('classifies sent messages without receipt handles as delete failures', async () => {
    const sqs = new FakeAwsClient([
      { Messages: [message('a', { ReceiptHandle: undefined })] },
      { Successful: [{ Id: 'msg-0' }], Failed: [] },
      { Messages: [] },
    ]);

    const result = await createService(sqs).moveMessages(MOVE);

    assert.strictEqual(result.totalMoved, 0);
    assert.strictEqual(result.totalDeleteFailed, 1);
    assert.strictEqual(sqs.sent(DeleteMessageBatchCommand).length, 0);
    assert.match(result.errors[0]?.error ?? '', /no ReceiptHandle available/);
  });

  it('rejects invalid messages before sending and reports validation failures separately', async () => {
    const progressEvents: (readonly [number, number, number, number])[] = [];
    const sqs = new FakeAwsClient([{ Messages: [message('a', { Body: '' })] }, { Messages: [] }]);

    const result = await createService(sqs).moveMessages(MOVE, {
      onProgress: (moved, sendFailed, deleteFailed, validationFailed) => {
        progressEvents.push([moved, sendFailed, deleteFailed, validationFailed]);
      },
    });

    assert.strictEqual(result.totalValidationFailed, 1);
    assert.strictEqual(result.totalSendFailed, 0);
    assert.strictEqual(result.totalFailed, 1);
    assert.strictEqual(sqs.sent(SendMessageBatchCommand).length, 0);
    assert.deepStrictEqual(progressEvents.at(-1), [0, 0, 0, 1]);
  });

  it('deduplicates dry-run receives by message id', async () => {
    const sqs = new FakeAwsClient([{ Messages: [message('same')] }, { Messages: [message('same')] }, { Messages: [] }]);

    const result = await createService(sqs).moveMessages({ ...MOVE, dryRun: true });

    assert.strictEqual(result.totalMoved, 1);
    assert.strictEqual(sqs.sent(SendMessageBatchCommand).length, 0);
    assert.strictEqual(sqs.inputs(ReceiveMessageCommand)[0]?.['VisibilityTimeout'], 0);
  });

  it('uses empty receive counters per worker when concurrency is enabled', async () => {
    const sqs = new FakeAwsClient(() => ({ Messages: [] }));

    const result = await createService(sqs).moveMessages({ ...MOVE, maxEmptyReceives: 2, concurrency: 3 });

    assert.strictEqual(result.totalMoved, 0);
    assert.strictEqual(sqs.sent(ReceiveMessageCommand).length, 6);
    assert.match(result.stopReason, /2 consecutive empty polls per worker/);
  });

  it('rejects source and target queue equality', async () => {
    await assert.rejects(
      createService(new FakeAwsClient()).moveMessages({ ...MOVE, targetQueueUrl: SOURCE }),
      /same queue/,
    );
  });
});
