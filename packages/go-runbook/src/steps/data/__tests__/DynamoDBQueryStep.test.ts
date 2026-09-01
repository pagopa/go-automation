import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DynamoDBQueryStep } from '../DynamoDBQueryStep.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import { createTestServiceRegistry } from '../../../services/createTestServiceRegistry.js';

interface QueryCall {
  readonly tableName: string;
  readonly keyConditionExpression: string;
  readonly values: Record<string, unknown>;
  readonly names: Record<string, string> | undefined;
}

function makeContext(params: ReadonlyArray<readonly [string, string]> = []): {
  readonly context: RunbookContext;
  readonly calls: QueryCall[];
} {
  const calls: QueryCall[] = [];
  const services = createTestServiceRegistry({
    dynamodb: {
      async query(
        tableName: string,
        keyConditionExpression: string,
        values: Record<string, unknown>,
        names: Record<string, string> | undefined,
      ): Promise<ReadonlyArray<Record<string, unknown>>> {
        calls.push({ tableName, keyConditionExpression, values, names });
        await Promise.resolve();
        return [{ pk: 'a' }];
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

describe('DynamoDBQueryStep', () => {
  it('returns the rows produced by the query', async () => {
    const { context } = makeContext();
    const step = new DynamoDBQueryStep({
      id: 'query-items',
      label: 'Query items',
      tableName: 'pn-Table',
      keyConditionExpression: 'pk = :pk',
      expressionAttributeValues: { ':pk': { S: 'a' } },
    });

    const result = await step.execute(context);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, [{ pk: 'a' }]);
  });

  it('interpolates params into the table name and the attribute values', async () => {
    const { context, calls } = makeContext([
      ['env', 'prod'],
      ['iun', 'ABC-123'],
    ]);
    const step = new DynamoDBQueryStep({
      id: 'query-items',
      label: 'Query items',
      tableName: 'pn-Table-{{params.env}}',
      keyConditionExpression: 'pk = :pk',
      expressionAttributeValues: { ':pk': { S: '{{params.iun}}' } },
    });

    await step.execute(context);

    assert.strictEqual(calls[0]?.tableName, 'pn-Table-prod');
    assert.deepStrictEqual(calls[0]?.values, { ':pk': { S: 'ABC-123' } });
  });

  it('passes no attribute names when none are configured', async () => {
    const { context, calls } = makeContext();
    const step = new DynamoDBQueryStep({
      id: 'query-items',
      label: 'Query items',
      tableName: 'pn-Table',
      keyConditionExpression: 'pk = :pk',
      expressionAttributeValues: { ':pk': { S: 'a' } },
    });

    await step.execute(context);

    assert.strictEqual(calls[0]?.names, undefined);
  });

  it('resolves expression attribute names when configured', async () => {
    const { context, calls } = makeContext([['field', 'status']]);
    const step = new DynamoDBQueryStep({
      id: 'query-items',
      label: 'Query items',
      tableName: 'pn-Table',
      keyConditionExpression: '#f = :pk',
      expressionAttributeValues: { ':pk': { S: 'a' } },
      expressionAttributeNames: { '#f': '{{params.field}}' },
    });

    await step.execute(context);

    assert.deepStrictEqual(calls[0]?.names, { '#f': 'status' });
  });
});
