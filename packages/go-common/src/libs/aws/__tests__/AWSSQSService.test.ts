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

import { AWSSQSService } from '../AWSSQSService.js';

type MockResponse = Record<string, unknown>;
type MockResponseFn = (command: object) => MockResponse;
type QueuedMockResponse = MockResponse | MockResponseFn;

interface CommandWithInput {
  readonly input: Record<string, unknown>;
}

class FakeSQSClient {
  readonly commands: object[] = [];

  constructor(private readonly responses: QueuedMockResponse[]) {}

  async send(command: object): Promise<MockResponse> {
    this.commands.push(command);

    const response = this.responses.shift();
    if (response === undefined) {
      throw new Error(`Unexpected SQS command: ${command.constructor.name}`);
    }

    await Promise.resolve();
    return typeof response === 'function' ? response(command) : response;
  }
}

function createService(fakeSqsClient: FakeSQSClient): AWSSQSService {
  const cloudWatchClient = {
    send: async () => {
      await Promise.resolve();
      return {};
    },
  } as unknown as CloudWatchClient;
  return new AWSSQSService(fakeSqsClient as unknown as SQSClient, cloudWatchClient);
}

function message(id: string, overrides: Partial<Message> = {}): Message {
  return {
    MessageId: id,
    ReceiptHandle: `receipt-${id}`,
    Body: `body-${id}`,
    ...overrides,
  };
}

function inputOf(command: object): Record<string, unknown> {
  return (command as CommandWithInput).input;
}

function commandAt(commands: ReadonlyArray<object>, index: number): object {
  const command = commands[index];
  assert.ok(command);
  return command;
}

function countCommands(
  commands: ReadonlyArray<object>,
  commandType: abstract new (...args: never[]) => object,
): number {
  return commands.filter((command) => command instanceof commandType).length;
}

describe('AWSSQSService', () => {
  it('aggregates successful send ids across retries', async () => {
    const fakeSqsClient = new FakeSQSClient([
      {
        Successful: [{ Id: 'msg-0' }],
        Failed: [{ Id: 'msg-1', Code: 'Throttled', Message: 'try again' }],
      },
      {
        Successful: [{ Id: 'msg-1' }],
        Failed: [],
      },
    ]);
    const service = createService(fakeSqsClient);

    const result = await service.sendMessageBatchWithRetries(
      'https://sqs.eu-south-1.amazonaws.com/123456789012/source',
      [
        { Id: 'msg-0', MessageBody: 'ok-first' },
        { Id: 'msg-1', MessageBody: 'ok-retry' },
      ],
      { maxRetries: 1 },
    );

    assert.deepStrictEqual(result.Successful?.map((entry) => entry.Id).sort(), ['msg-0', 'msg-1']);
    assert.deepStrictEqual(result.Failed, []);
    assert.strictEqual(countCommands(fakeSqsClient.commands, SendMessageBatchCommand), 2);
    assert.deepStrictEqual(inputOf(commandAt(fakeSqsClient.commands, 1))['Entries'], [
      { Id: 'msg-1', MessageBody: 'ok-retry' },
    ]);
  });

  it('classifies delete failures as duplicate risk after a successful send', async () => {
    const fakeSqsClient = new FakeSQSClient([
      { Messages: [message('a')] },
      { Successful: [{ Id: 'msg-0' }], Failed: [] },
      { Successful: [], Failed: [{ Id: 'msg-0', Code: 'InternalError', Message: 'delete failed' }] },
      { Messages: [] },
    ]);
    const service = createService(fakeSqsClient);

    const result = await service.moveMessages({
      sourceQueueUrl: 'https://sqs.eu-south-1.amazonaws.com/123456789012/source',
      targetQueueUrl: 'https://sqs.eu-south-1.amazonaws.com/123456789012/target',
      isFifo: false,
      visibilityTimeout: 60,
      batchSize: 10,
      dryRun: false,
      maxEmptyReceives: 1,
    });

    assert.strictEqual(result.totalMoved, 0);
    assert.strictEqual(result.totalDeleteFailed, 1);
    assert.strictEqual(result.totalFailed, 1);
    assert.strictEqual(result.errors[0]?.stage, 'delete');
    assert.match(result.errors[0]?.error ?? '', /duplicate at risk/i);
  });

  it('classifies sent messages without receipt handles as delete failures', async () => {
    const fakeSqsClient = new FakeSQSClient([
      { Messages: [message('a', { ReceiptHandle: undefined })] },
      { Successful: [{ Id: 'msg-0' }], Failed: [] },
      { Messages: [] },
    ]);
    const service = createService(fakeSqsClient);

    const result = await service.moveMessages({
      sourceQueueUrl: 'https://sqs.eu-south-1.amazonaws.com/123456789012/source',
      targetQueueUrl: 'https://sqs.eu-south-1.amazonaws.com/123456789012/target',
      isFifo: false,
      visibilityTimeout: 60,
      batchSize: 10,
      dryRun: false,
      maxEmptyReceives: 1,
    });

    assert.strictEqual(result.totalMoved, 0);
    assert.strictEqual(result.totalDeleteFailed, 1);
    assert.strictEqual(countCommands(fakeSqsClient.commands, DeleteMessageBatchCommand), 0);
    assert.match(result.errors[0]?.error ?? '', /no ReceiptHandle available/);
  });

  it('rejects invalid messages before sending and reports validation failures separately', async () => {
    const progressEvents: (readonly [number, number, number, number])[] = [];
    const fakeSqsClient = new FakeSQSClient([{ Messages: [message('a', { Body: '' })] }, { Messages: [] }]);
    const service = createService(fakeSqsClient);

    const result = await service.moveMessages(
      {
        sourceQueueUrl: 'https://sqs.eu-south-1.amazonaws.com/123456789012/source',
        targetQueueUrl: 'https://sqs.eu-south-1.amazonaws.com/123456789012/target',
        isFifo: false,
        visibilityTimeout: 60,
        batchSize: 10,
        dryRun: false,
        maxEmptyReceives: 1,
      },
      {
        onProgress: (moved, sendFailed, deleteFailed, validationFailed) => {
          progressEvents.push([moved, sendFailed, deleteFailed, validationFailed]);
        },
      },
    );

    assert.strictEqual(result.totalValidationFailed, 1);
    assert.strictEqual(result.totalSendFailed, 0);
    assert.strictEqual(result.totalFailed, 1);
    assert.strictEqual(countCommands(fakeSqsClient.commands, SendMessageBatchCommand), 0);
    assert.deepStrictEqual(progressEvents.at(-1), [0, 0, 0, 1]);
  });

  it('deduplicates dry-run receives by message id', async () => {
    const fakeSqsClient = new FakeSQSClient([
      { Messages: [message('same')] },
      { Messages: [message('same')] },
      { Messages: [] },
    ]);
    const service = createService(fakeSqsClient);

    const result = await service.moveMessages({
      sourceQueueUrl: 'https://sqs.eu-south-1.amazonaws.com/123456789012/source',
      targetQueueUrl: 'https://sqs.eu-south-1.amazonaws.com/123456789012/target',
      isFifo: false,
      visibilityTimeout: 60,
      batchSize: 10,
      dryRun: true,
      maxEmptyReceives: 1,
    });

    assert.strictEqual(result.totalMoved, 1);
    assert.strictEqual(countCommands(fakeSqsClient.commands, SendMessageBatchCommand), 0);
    assert.strictEqual(inputOf(commandAt(fakeSqsClient.commands, 0))['VisibilityTimeout'], 0);
  });

  it('uses empty receive counters per worker when concurrency is enabled', async () => {
    const fakeSqsClient = new FakeSQSClient(Array.from({ length: 6 }, () => ({ Messages: [] })));
    const service = createService(fakeSqsClient);

    const result = await service.moveMessages({
      sourceQueueUrl: 'https://sqs.eu-south-1.amazonaws.com/123456789012/source',
      targetQueueUrl: 'https://sqs.eu-south-1.amazonaws.com/123456789012/target',
      isFifo: false,
      visibilityTimeout: 60,
      batchSize: 10,
      dryRun: false,
      maxEmptyReceives: 2,
      concurrency: 3,
    });

    assert.strictEqual(result.totalMoved, 0);
    assert.strictEqual(countCommands(fakeSqsClient.commands, ReceiveMessageCommand), 6);
    assert.match(result.stopReason, /2 consecutive empty polls per worker/);
  });

  it('rejects source and target queue equality', async () => {
    const fakeSqsClient = new FakeSQSClient([]);
    const service = createService(fakeSqsClient);

    await assert.rejects(
      service.moveMessages({
        sourceQueueUrl: 'https://sqs.eu-south-1.amazonaws.com/123456789012/source',
        targetQueueUrl: 'https://sqs.eu-south-1.amazonaws.com/123456789012/source',
        isFifo: false,
        visibilityTimeout: 60,
        batchSize: 10,
        dryRun: false,
      }),
      /same queue/,
    );
  });
});
