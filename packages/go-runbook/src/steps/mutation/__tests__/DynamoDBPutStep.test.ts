import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import { createTestServiceRegistry, type TestServiceOverrides } from '../../../services/createTestServiceRegistry.js';
import { DynamoDBPutStep } from '../DynamoDBPutStep.js';

function createContext(args: {
  readonly vars?: Record<string, string>;
  readonly params?: Record<string, string>;
  readonly services?: TestServiceOverrides;
}): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map<string, unknown>(),
    vars: new Map(Object.entries(args.vars ?? {})),
    params: new Map(Object.entries(args.params ?? {})),
    logs: [],
    services: createTestServiceRegistry(args.services ?? {}),
    recoveredErrors: [],
  };
}

describe('DynamoDBPutStep', () => {
  const base = { id: 'put-item', label: 'Put item', tableName: 'pn-Table', item: { pk: 'a', sk: 'b' } } as const;

  it('forwards table and item to the DynamoDB service', async () => {
    const calls: (readonly [string, Record<string, unknown>])[] = [];
    const dynamodb = {
      putItem: async (tableName: string, item: Record<string, unknown>): Promise<void> => {
        await Promise.resolve();
        calls.push([tableName, item]);
      },
    };

    const result = await new DynamoDBPutStep(base).execute(createContext({ services: { dynamodb } }));

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(calls, [['pn-Table', { pk: 'a', sk: 'b' }]]);
  });

  it('copies the item so the step config cannot be mutated by the service', async () => {
    let received: Record<string, unknown> | undefined;
    const dynamodb = {
      putItem: async (_t: string, item: Record<string, unknown>): Promise<void> => {
        await Promise.resolve();
        received = item;
      },
    };

    await new DynamoDBPutStep(base).execute(createContext({ services: { dynamodb } }));

    assert.notStrictEqual(received, base.item);
    assert.deepStrictEqual(received, base.item);
  });

  it('turns a service failure into an unsuccessful result instead of throwing', async () => {
    const dynamodb = {
      putItem: async (): Promise<void> => {
        await Promise.resolve();
        throw new Error('AccessDenied');
      },
    };

    const result = await new DynamoDBPutStep(base).execute(createContext({ services: { dynamodb } }));

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /DynamoDB put failed: AccessDenied/u);
  });
});
