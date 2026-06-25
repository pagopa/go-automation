import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { SQSEvent } from 'aws-lambda';

import type { ExecuteRunbookDeps, ExecuteRunbookResult } from 'go-execute-runbook/api';

import { processExecuteRunbookBatch } from '../handler.js';

describe('go-ExecuteRunbookLambda handler', () => {
  it('returns only the failed SQS message id in the partial batch response', async () => {
    const event = sqsEvent('not-json');
    const result = await processExecuteRunbookBatch(event, {} as ExecuteRunbookDeps, () => 60_000);
    assert.deepStrictEqual(result, { batchItemFailures: [{ itemIdentifier: 'message-1' }] });
  });

  it('ACKs a valid command when the shared execute core returns normally', async () => {
    const body = JSON.stringify({
      schemaVersion: '1.0.0',
      executionId: '0192c000-0000-7000-8000-000000000001',
      alarmEvent: {
        id: '0192c000-0000-7000-8000-0000000000aa',
        productId: '0192c000-0000-7000-8000-0000000000bb',
        environmentId: '0192c000-0000-7000-8000-0000000000cc',
        alarmId: '0192c000-0000-7000-8000-0000000000dd',
        alarmName: 'alarm',
        firedAt: '2026-06-22T10:00:00.000Z',
        awsAccountId: '170533023216',
        awsRegion: 'eu-south-1',
      },
      trigger: { kind: 'SLACK_INGESTER' },
    });
    const execute = async (): Promise<ExecuteRunbookResult> => {
      await Promise.resolve();
      return { disposition: 'COMPLETE_OUTCOME', executionId: 'execution', status: 'SUCCEEDED' } as const;
    };

    const result = await processExecuteRunbookBatch(sqsEvent(body), {} as ExecuteRunbookDeps, () => 60_000, execute);

    assert.deepStrictEqual(result, { batchItemFailures: [] });
  });

  it('retries without invoking the shared execute core when Lambda time is below the safety budget', async () => {
    const body = JSON.stringify(validCommand());
    let executeCalls = 0;
    const execute = async (): Promise<ExecuteRunbookResult> => {
      await Promise.resolve();
      executeCalls += 1;
      return { disposition: 'COMPLETE_OUTCOME', executionId: 'execution', status: 'SUCCEEDED' } as const;
    };

    const result = await processExecuteRunbookBatch(sqsEvent(body), {} as ExecuteRunbookDeps, () => 30_000, execute);

    assert.deepStrictEqual(result, { batchItemFailures: [{ itemIdentifier: 'message-1' }] });
    assert.strictEqual(executeCalls, 0);
  });

  it('passes a worker deadline inside the Lambda safety budget', async () => {
    const body = JSON.stringify(validCommand());
    const before = Date.now();
    let workerDeadlineAt = '';
    const execute = async (
      _deps: ExecuteRunbookDeps,
      _input: unknown,
      delivery: { readonly workerDeadlineAt: string },
    ): Promise<ExecuteRunbookResult> => {
      await Promise.resolve();
      workerDeadlineAt = delivery.workerDeadlineAt;
      return { disposition: 'COMPLETE_OUTCOME', executionId: 'execution', status: 'SUCCEEDED' } as const;
    };

    const result = await processExecuteRunbookBatch(sqsEvent(body), {} as ExecuteRunbookDeps, () => 60_000, execute);

    assert.deepStrictEqual(result, { batchItemFailures: [] });
    const deadlineMs = Date.parse(workerDeadlineAt);
    assert.ok(deadlineMs >= before + 29_000);
    assert.ok(deadlineMs <= Date.now() + 30_000);
  });

  it('ACKs an unsupported command version after a confirmed PRE_START fail callback', async () => {
    const invalidVersion = JSON.stringify({
      schemaVersion: '2.0.0',
      executionId: '0192c000-0000-7000-8000-000000000001',
    });
    let failKey = '';
    const deps = {
      watchtower: {
        failExecution: async (_id: string, _body: unknown, options: { readonly idempotencyKey: string }) => {
          await Promise.resolve();
          failKey = options.idempotencyKey;
          return { status: 'FAILED' };
        },
      },
    } as unknown as ExecuteRunbookDeps;

    const result = await processExecuteRunbookBatch(sqsEvent(invalidVersion), deps, () => 60_000);

    assert.deepStrictEqual(result, { batchItemFailures: [] });
    assert.strictEqual(failKey, 'fail:0192c000-0000-7000-8000-000000000001:message-1:1:UNSUPPORTED_COMMAND_VERSION');
  });
});

function sqsEvent(body: string): SQSEvent {
  return {
    Records: [
      {
        messageId: 'message-1',
        receiptHandle: 'receipt',
        body,
        attributes: {
          ApproximateReceiveCount: '1',
          SentTimestamp: '0',
          SenderId: 'sender',
          ApproximateFirstReceiveTimestamp: '0',
        },
        messageAttributes: {},
        md5OfBody: 'md5',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:eu-south-1:170533023216:queue.fifo',
        awsRegion: 'eu-south-1',
      },
    ],
  };
}

function validCommand(): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: '1.0.0',
    executionId: '0192c000-0000-7000-8000-000000000001',
    alarmEvent: {
      id: '0192c000-0000-7000-8000-0000000000aa',
      productId: '0192c000-0000-7000-8000-0000000000bb',
      environmentId: '0192c000-0000-7000-8000-0000000000cc',
      alarmId: '0192c000-0000-7000-8000-0000000000dd',
      alarmName: 'alarm',
      firedAt: '2026-06-22T10:00:00.000Z',
      awsAccountId: '170533023216',
      awsRegion: 'eu-south-1',
    },
    trigger: { kind: 'SLACK_INGESTER' },
  };
}
