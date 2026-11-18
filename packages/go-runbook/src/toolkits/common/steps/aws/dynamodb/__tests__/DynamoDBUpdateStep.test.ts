import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DynamoDBUpdateStep } from '../DynamoDBUpdateStep.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';

describe('DynamoDBUpdateStep', () => {
  const base = {
    id: 'update-item',
    label: 'Update item',
    tableName: 'pn-Table',
    key: { pk: 'a' },
    updateExpression: 'SET #s = :val',
    expressionAttributeValues: { ':val': 'done' },
  } as const;

  it('forwards every update argument, attribute names only when configured', async () => {
    for (const names of [undefined, { '#s': 'status' }]) {
      const calls: unknown[][] = [];
      const updateItem = async (...args: unknown[]): Promise<void> => {
        await Promise.resolve();
        calls.push(args);
      };
      const step = new DynamoDBUpdateStep({
        ...base,
        ...(names === undefined ? {} : { expressionAttributeNames: names }),
      });

      const result = await step.execute(createTestContext({ services: { dynamodb: { updateItem } } }));

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(calls, [['pn-Table', { pk: 'a' }, 'SET #s = :val', { ':val': 'done' }, names]]);
    }
  });

  it('turns a service failure into an unsuccessful result instead of throwing', async () => {
    const updateItem = async (): Promise<void> => Promise.reject(new Error('ConditionalCheckFailed'));

    const result = await new DynamoDBUpdateStep(base).execute(
      createTestContext({ services: { dynamodb: { updateItem } } }),
    );

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /DynamoDB update failed: ConditionalCheckFailed/u);
  });
});
