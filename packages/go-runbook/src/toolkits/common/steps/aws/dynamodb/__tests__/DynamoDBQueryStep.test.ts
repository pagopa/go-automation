import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { StepResult } from '../../../../../../engine/types/StepResult.js';
import { DynamoDBQueryStep } from '../DynamoDBQueryStep.js';
import type { DynamoDBQueryConfig } from '../DynamoDBQueryStep.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';

const BASE = {
  id: 'query-items',
  label: 'Query items',
  tableName: 'pn-Table',
  keyConditionExpression: 'pk = :pk',
  expressionAttributeValues: { ':pk': { S: 'a' } },
} as const;

/** Runs the query step against a stub table and returns its result with the recorded calls. */
async function runQuery(
  config: DynamoDBQueryConfig,
  params: Readonly<Record<string, string>> = {},
): Promise<{ readonly result: StepResult<ReadonlyArray<Record<string, unknown>>>; readonly calls: unknown[][] }> {
  const calls: unknown[][] = [];
  const query = async (...args: unknown[]): Promise<ReadonlyArray<Record<string, unknown>>> => {
    // Table, key condition, values and names; the options and the abort signal follow.
    calls.push(args.slice(0, 4));
    return Promise.resolve([{ pk: 'a' }]);
  };
  const result = await new DynamoDBQueryStep(config).execute(
    createTestContext({ params, services: { dynamodb: { query } } }),
  );
  return { result, calls };
}

describe('DynamoDBQueryStep', () => {
  it('returns the rows produced by the query, passing no attribute names when none are configured', async () => {
    const { result, calls } = await runQuery(BASE);

    assert.deepStrictEqual(result, { success: true, output: [{ pk: 'a' }] });
    assert.deepStrictEqual(calls, [['pn-Table', 'pk = :pk', { ':pk': { S: 'a' } }, undefined]]);
  });

  it('interpolates params into the table name, the attribute values and the attribute names', async () => {
    const { calls } = await runQuery(
      {
        ...BASE,
        tableName: 'pn-Table-{{params.env}}',
        keyConditionExpression: '#f = :pk',
        expressionAttributeValues: { ':pk': { S: '{{params.iun}}' } },
        expressionAttributeNames: { '#f': '{{params.field}}' },
      },
      { env: 'prod', iun: 'ABC-123', field: 'status' },
    );

    assert.deepStrictEqual(calls, [['pn-Table-prod', '#f = :pk', { ':pk': { S: 'ABC-123' } }, { '#f': 'status' }]]);
  });
});
