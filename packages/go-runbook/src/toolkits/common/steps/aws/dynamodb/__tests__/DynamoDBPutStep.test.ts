import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DynamoDBPutStep } from '../DynamoDBPutStep.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';

describe('DynamoDBPutStep', () => {
  const base = { id: 'put-item', label: 'Put item', tableName: 'pn-Table', item: { pk: 'a', sk: 'b' } } as const;

  it('forwards table and a copy of the item, so the service cannot mutate the step config', async () => {
    const calls: (readonly [string, Record<string, unknown>])[] = [];
    const putItem = async (tableName: string, item: Record<string, unknown>): Promise<void> => {
      await Promise.resolve();
      calls.push([tableName, item]);
    };

    const result = await new DynamoDBPutStep(base).execute(createTestContext({ services: { dynamodb: { putItem } } }));

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(calls, [['pn-Table', { pk: 'a', sk: 'b' }]]);
    assert.notStrictEqual(calls[0]?.[1], base.item);
  });

  it('turns a service failure into an unsuccessful result instead of throwing', async () => {
    const putItem = async (): Promise<void> => Promise.reject(new Error('AccessDenied'));

    const result = await new DynamoDBPutStep(base).execute(createTestContext({ services: { dynamodb: { putItem } } }));

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /DynamoDB put failed: AccessDenied/u);
  });
});
