import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import { createTestServiceRegistry, type TestServiceOverrides } from '../../../services/createTestServiceRegistry.js';
import { DynamoDBUpdateStep } from '../DynamoDBUpdateStep.js';

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

describe('DynamoDBUpdateStep', () => {
  const base = {
    id: 'update-item',
    label: 'Update item',
    tableName: 'pn-Table',
    key: { pk: 'a' },
    updateExpression: 'SET #s = :val',
    expressionAttributeValues: { ':val': 'done' },
  } as const;

  it('forwards every update argument to the DynamoDB service', async () => {
    const calls: unknown[][] = [];
    const dynamodb = {
      updateItem: async (...args: unknown[]): Promise<void> => {
        await Promise.resolve();
        calls.push(args);
      },
    };

    const result = await new DynamoDBUpdateStep(base).execute(createContext({ services: { dynamodb } }));

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(calls, [['pn-Table', { pk: 'a' }, 'SET #s = :val', { ':val': 'done' }, undefined]]);
  });

  it('passes expression attribute names when configured', async () => {
    const calls: unknown[][] = [];
    const dynamodb = {
      updateItem: async (...args: unknown[]): Promise<void> => {
        await Promise.resolve();
        calls.push(args);
      },
    };

    await new DynamoDBUpdateStep({ ...base, expressionAttributeNames: { '#s': 'status' } }).execute(
      createContext({ services: { dynamodb } }),
    );

    assert.deepStrictEqual(calls[0]?.[4], { '#s': 'status' });
  });

  it('turns a service failure into an unsuccessful result instead of throwing', async () => {
    const dynamodb = {
      updateItem: async (): Promise<void> => {
        await Promise.resolve();
        throw new Error('ConditionalCheckFailed');
      },
    };

    const result = await new DynamoDBUpdateStep(base).execute(createContext({ services: { dynamodb } }));

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /DynamoDB update failed: ConditionalCheckFailed/u);
  });
});
