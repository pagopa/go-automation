import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DescribeTableCommand, QueryCommand, type DynamoDBClient, type AttributeValue } from '@aws-sdk/client-dynamodb';

import { DynamoDBQueryService } from '../DynamoDBQueryService.js';

type DynamoCommand = DescribeTableCommand | QueryCommand;

interface DynamoResponse {
  readonly Table?: {
    readonly TableName?: string;
    readonly TableStatus?: 'ACTIVE' | 'CREATING';
  };
  readonly Items?: ReadonlyArray<Record<string, AttributeValue>>;
  readonly LastEvaluatedKey?: Record<string, AttributeValue>;
}

interface FakeDynamoDBClient {
  readonly commands: DynamoCommand[];
  send(command: DynamoCommand): Promise<DynamoResponse>;
}

function asDynamoDBClient(client: FakeDynamoDBClient): DynamoDBClient {
  return client as unknown as DynamoDBClient;
}

describe('DynamoDBQueryService', () => {
  it('describes tables and returns table status', async () => {
    const responses: DynamoResponse[] = [
      { Table: { TableName: 'table-a', TableStatus: 'ACTIVE' } },
      { Table: { TableName: 'table-a', TableStatus: 'CREATING' } },
      {},
    ];
    const fakeClient: FakeDynamoDBClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        return responses.shift() ?? {};
      },
    };
    const service = new DynamoDBQueryService(asDynamoDBClient(fakeClient));

    assert.deepStrictEqual(await service.describeTable('table-a'), {
      TableName: 'table-a',
      TableStatus: 'ACTIVE',
    });
    assert.strictEqual(await service.getTableStatus('table-a'), 'CREATING');
    assert.strictEqual(await service.describeTable('missing'), undefined);
    assert.ok(fakeClient.commands.every((command) => command instanceof DescribeTableCommand));
  });

  it('queries partition keys with pagination, sort keys, projection and unmarshalling', async () => {
    const fakeClient: FakeDynamoDBClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        if (!(command instanceof QueryCommand)) {
          return {};
        }
        if (this.commands.filter((recorded) => recorded instanceof QueryCommand).length === 1) {
          return {
            Items: [
              {
                pk: { S: 'P#abc#S' },
                sk: { N: '7' },
                status: { S: 'OPEN' },
              },
            ],
            LastEvaluatedKey: { pk: { S: 'cursor' } },
          };
        }
        return {
          Items: [
            {
              pk: { S: 'P#abc#S' },
              sk: { N: '7' },
              amount: { N: '12' },
            },
          ],
        };
      },
    };
    const service = new DynamoDBQueryService(asDynamoDBClient(fakeClient));

    const result = await service.queryByPartitionKey<{
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

    const firstCommand = fakeClient.commands[0];
    const secondCommand = fakeClient.commands[1];
    assert.ok(firstCommand instanceof QueryCommand);
    assert.ok(secondCommand instanceof QueryCommand);
    assert.strictEqual(firstCommand.input.TableName, 'table-a');
    assert.strictEqual(firstCommand.input.IndexName, 'by-sk');
    assert.strictEqual(firstCommand.input.KeyConditionExpression, '#pk = :pkVal AND #sk = :skVal');
    assert.deepStrictEqual(firstCommand.input.ExpressionAttributeNames, {
      '#pk': 'pk',
      '#sk': 'sk',
      '#attr0': 'status',
      '#attr1': 'amount',
    });
    assert.deepStrictEqual(firstCommand.input.ExpressionAttributeValues, {
      ':pkVal': { S: 'P#abc#S' },
      ':skVal': { N: '7' },
    });
    assert.strictEqual(firstCommand.input.ProjectionExpression, '#attr0, #attr1');
    assert.deepStrictEqual(secondCommand.input.ExclusiveStartKey, { pk: { S: 'cursor' } });
  });

  it('can return raw DynamoDB items and numeric partition key values', async () => {
    const rawItem: Record<string, AttributeValue> = {
      id: { N: '42' },
      payload: { S: 'raw' },
    };
    const fakeClient: FakeDynamoDBClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        return { Items: [rawItem] };
      },
    };
    const service = new DynamoDBQueryService(asDynamoDBClient(fakeClient));

    const result = await service.queryByPartitionKey('42', {
      tableName: 'table-a',
      keyName: 'id',
      keyType: 'N',
      isRaw: true,
    });

    assert.strictEqual(result.items[0], rawItem);
    assert.strictEqual(result.fullKey, '42');

    const command = fakeClient.commands[0];
    assert.ok(command instanceof QueryCommand);
    assert.deepStrictEqual(command.input.ExpressionAttributeValues, {
      ':pkVal': { N: '42' },
    });
  });

  it('queries multiple keys, captures per-key failures and reports progress in input order', async () => {
    const fakeClient: FakeDynamoDBClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        if (!(command instanceof QueryCommand)) {
          return {};
        }

        const keyValue = command.input.ExpressionAttributeValues?.[':pkVal'];
        const fullKey = keyValue?.S ?? '';
        if (fullKey === 'P#bad#S') {
          throw new Error('boom');
        }

        return {
          Items: [
            {
              pk: { S: fullKey },
            },
          ],
        };
      },
    };
    const service = new DynamoDBQueryService(asDynamoDBClient(fakeClient));
    const progress: (readonly [number, number])[] = [];

    const results = await service.queryMultipleByPartitionKey(
      ['one', 'bad', 'two'],
      {
        tableName: 'table-a',
        keyName: 'pk',
        prefix: 'P#',
        suffix: '#S',
      },
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
    const fakeClient: FakeDynamoDBClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        throw new Error('boom');
      },
    };
    const service = new DynamoDBQueryService(asDynamoDBClient(fakeClient));

    assert.deepStrictEqual(
      await service.queryMultipleByPartitionKey([], {
        tableName: 'table-a',
        keyName: 'pk',
      }),
      [],
    );

    await assert.rejects(
      service.queryMultipleByPartitionKey(['bad'], {
        tableName: 'table-a',
        keyName: 'pk',
        failFast: true,
      }),
      /Query failed for "bad": boom/,
    );

    await assert.rejects(
      service.queryByPartitionKey('value', {
        tableName: 'table-a',
        keyName: 'pk',
        sortKeyName: 'sk',
      }),
      /sortKeyName and sortKeyValue must be provided together/,
    );

    await assert.rejects(
      service.queryByPartitionKey('value', {
        tableName: 'table-a',
        keyName: 'pk',
        keyType: 'N',
        prefix: 'P#',
      }),
      /prefix\/suffix are only supported when keyType is 'S'/,
    );
  });
});
