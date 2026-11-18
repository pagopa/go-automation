import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DynamoDBGetStep } from '../DynamoDBGetStep.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';

describe('DynamoDBGetStep', () => {
  it('interpolates params into the table name and the key, and returns the fetched item', async () => {
    const calls: unknown[][] = [];
    const getItem = async (...args: unknown[]): Promise<Record<string, unknown>> => {
      // Table name and key; the abort signal follows.
      calls.push(args.slice(0, 2));
      return Promise.resolve({ pk: 'a' });
    };
    const step = new DynamoDBGetStep({
      id: 'get-item',
      label: 'Get item',
      tableName: 'pn-Table-{{params.env}}',
      key: { iun: '{{params.iun}}' },
    });

    const result = await step.execute(
      createTestContext({ params: { env: 'prod', iun: 'ABC-123' }, services: { dynamodb: { getItem } } }),
    );

    assert.deepStrictEqual(result, { success: true, output: { pk: 'a' } });
    assert.deepStrictEqual(calls, [['pn-Table-prod', { iun: 'ABC-123' }]]);
  });

  it('reports a missing item as an undefined output, not as a failure', async () => {
    const getItem = async (): Promise<undefined> => Promise.resolve(undefined);
    const step = new DynamoDBGetStep({ id: 'get-item', label: 'Get item', tableName: 'pn-Table', key: { pk: 'a' } });

    const result = await step.execute(createTestContext({ services: { dynamodb: { getItem } } }));

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, undefined);
  });
});
