import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DynamoDBGetStep } from '../DynamoDBGetStep.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import { createTestServiceRegistry } from '../../../registry/createTestServiceRegistry.js';

interface GetItemCall {
  readonly tableName: string;
  readonly key: Record<string, unknown>;
}

function makeContext(args: {
  readonly params?: ReadonlyArray<readonly [string, string]>;
  /** Item the stubbed table returns; omit to simulate a missing item. */
  readonly item?: Record<string, unknown>;
}): { readonly context: RunbookContext; readonly calls: GetItemCall[] } {
  const { params = [], item } = args;
  const calls: GetItemCall[] = [];
  const services = createTestServiceRegistry({
    dynamodb: {
      async getItem(tableName: string, key: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
        calls.push({ tableName, key });
        await Promise.resolve();
        return item;
      },
    },
  });

  return {
    calls,
    context: {
      executionId: 'test',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      stepResults: new Map(),
      vars: new Map(),
      params: new Map(params),
      logs: [],
      services,
      recoveredErrors: [],
    },
  };
}

describe('DynamoDBGetStep', () => {
  it('returns the item fetched from the table', async () => {
    const { context } = makeContext({ item: { pk: 'a' } });
    const step = new DynamoDBGetStep({
      id: 'get-item',
      label: 'Get item',
      tableName: 'pn-Table',
      key: { pk: 'a' },
    });

    const result = await step.execute(context);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, { pk: 'a' });
  });

  it('interpolates params into the table name and the key', async () => {
    const { context, calls } = makeContext({
      params: [
        ['env', 'prod'],
        ['iun', 'ABC-123'],
      ],
      item: { pk: 'a' },
    });
    const step = new DynamoDBGetStep({
      id: 'get-item',
      label: 'Get item',
      tableName: 'pn-Table-{{params.env}}',
      key: { iun: '{{params.iun}}' },
    });

    await step.execute(context);

    assert.deepStrictEqual(calls, [{ tableName: 'pn-Table-prod', key: { iun: 'ABC-123' } }]);
  });

  it('reports a missing item as an undefined output, not as a failure', async () => {
    const { context } = makeContext({});
    const step = new DynamoDBGetStep({ id: 'get-item', label: 'Get item', tableName: 'pn-Table', key: { pk: 'a' } });

    const result = await step.execute(context);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, undefined);
  });
});
