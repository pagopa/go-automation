import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DescribeTableCommand, QueryCommand, type AttributeValue, type DynamoDBClient } from '@aws-sdk/client-dynamodb';

import { FakeAwsClient } from '../../__tests__/helpers/FakeAwsClient.js';
import { DynamoDBQueryService } from '../DynamoDBQueryService.js';

function serviceOf(client: FakeAwsClient): DynamoDBQueryService {
  return new DynamoDBQueryService(client.as<DynamoDBClient>());
}

describe('DynamoDBQueryService', () => {
  it('describes tables and returns table status', async () => {
    const client = new FakeAwsClient([
      { Table: { TableName: 'table-a', TableStatus: 'ACTIVE' } },
      { Table: { TableName: 'table-a', TableStatus: 'CREATING' } },
      {},
    ]);
    const service = serviceOf(client);

    assert.deepStrictEqual(await service.describeTable('table-a'), { TableName: 'table-a', TableStatus: 'ACTIVE' });
    assert.strictEqual(await service.getTableStatus('table-a'), 'CREATING');
    assert.strictEqual(await service.describeTable('missing'), undefined);
    assert.strictEqual(client.sent(DescribeTableCommand).length, 3);
  });

  it('queries partition keys with pagination, sort keys, projection and unmarshalling', async () => {
    const client = new FakeAwsClient([
      {
        Items: [{ pk: { S: 'P#abc#S' }, sk: { N: '7' }, status: { S: 'OPEN' } }],
        LastEvaluatedKey: { pk: { S: 'cursor' } },
      },
      { Items: [{ pk: { S: 'P#abc#S' }, sk: { N: '7' }, amount: { N: '12' } }] },
    ]);

    const result = await serviceOf(client).queryByPartitionKey<{
      readonly pk: string;
      readonly sk: number;
      readonly status?: string;
      readonly amount?: number;
    }>('abc', {
      tableName: 'table-a',
      keyName: 'pk',
      prefix: 'P#',
      suffix: '#S',
      sortKeyName: 'sk',
      sortKeyValue: '7',
      sortKeyType: 'N',
      indexName: 'by-sk',
      projection: ['status', 'amount'],
    });

    assert.deepStrictEqual(result, {
      keyValue: 'abc',
      fullKey: 'P#abc#S',
      items: [
        { pk: 'P#abc#S', sk: 7, status: 'OPEN' },
        { pk: 'P#abc#S', sk: 7, amount: 12 },
      ],
      count: 2,
    });
    const [first, second] = client.inputs(QueryCommand);
    assert.deepStrictEqual(first, {
      TableName: 'table-a',
      IndexName: 'by-sk',
      KeyConditionExpression: '#pk = :pkVal AND #sk = :skVal',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk', '#attr0': 'status', '#attr1': 'amount' },
      ExpressionAttributeValues: { ':pkVal': { S: 'P#abc#S' }, ':skVal': { N: '7' } },
      ProjectionExpression: '#attr0, #attr1',
    });
    assert.deepStrictEqual(second?.['ExclusiveStartKey'], { pk: { S: 'cursor' } });
  });

  it('can return raw DynamoDB items and numeric partition key values', async () => {
    const rawItem: Record<string, AttributeValue> = { id: { N: '42' }, payload: { S: 'raw' } };
    const client = new FakeAwsClient([{ Items: [rawItem] }]);

    const result = await serviceOf(client).queryByPartitionKey('42', {
      tableName: 'table-a',
      keyName: 'id',
      keyType: 'N',
      isRaw: true,
    });

    assert.strictEqual(result.items[0], rawItem);
    assert.strictEqual(result.fullKey, '42');
    assert.deepStrictEqual(client.inputs(QueryCommand)[0]?.['ExpressionAttributeValues'], { ':pkVal': { N: '42' } });
  });

  it('queries multiple keys, captures per-key failures and reports progress in input order', async () => {
    const client = new FakeAwsClient((command) => {
      const fullKey = (command as QueryCommand).input.ExpressionAttributeValues?.[':pkVal']?.S ?? '';
      return fullKey === 'P#bad#S' ? new Error('boom') : { Items: [{ pk: { S: fullKey } }] };
    });
    const progress: (readonly [number, number])[] = [];

    const results = await serviceOf(client).queryMultipleByPartitionKey(
      ['one', 'bad', 'two'],
      { tableName: 'table-a', keyName: 'pk', prefix: 'P#', suffix: '#S' },
      (current, total) => {
        progress.push([current, total]);
      },
    );

    assert.deepStrictEqual(
      results.map((result) => result.keyValue),
      ['one', 'bad', 'two'],
    );
    assert.deepStrictEqual(results[0]?.items, [{ pk: 'P#one#S' }]);
    assert.strictEqual(results[1]?.fullKey, 'P#bad#S');
    assert.strictEqual(results[1]?.count, 0);
    assert.match(results[1]?.error?.message ?? '', /boom/);
    assert.deepStrictEqual(results[2]?.items, [{ pk: 'P#two#S' }]);
    assert.deepStrictEqual(progress.at(-1), [3, 3]);
  });

  it('handles empty batches, fail-fast errors and invalid query options', async () => {
    const service = serviceOf(new FakeAwsClient(() => new Error('boom')));

    assert.deepStrictEqual(await service.queryMultipleByPartitionKey([], { tableName: 'table-a', keyName: 'pk' }), []);
    await assert.rejects(
      service.queryMultipleByPartitionKey(['bad'], { tableName: 'table-a', keyName: 'pk', failFast: true }),
      /Query failed for "bad": boom/,
    );
    await assert.rejects(
      service.queryByPartitionKey('value', { tableName: 'table-a', keyName: 'pk', sortKeyName: 'sk' }),
      /sortKeyName and sortKeyValue must be provided together/,
    );
    await assert.rejects(
      service.queryByPartitionKey('value', { tableName: 'table-a', keyName: 'pk', keyType: 'N', prefix: 'P#' }),
      /prefix\/suffix are only supported when keyType is 'S'/,
    );
  });
});
