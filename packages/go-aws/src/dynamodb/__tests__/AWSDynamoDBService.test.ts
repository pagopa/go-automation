import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
  type DynamoDBClient,
} from '@aws-sdk/client-dynamodb';

import { FakeAwsClient } from '../../__tests__/helpers/FakeAwsClient.js';
import { AWSDynamoDBService } from '../AWSDynamoDBService.js';

describe('AWSDynamoDBService', () => {
  it('queries with pagination and unmarshalls items', async () => {
    const client = new FakeAwsClient([
      { Items: [{ id: { S: '1' } }], LastEvaluatedKey: { id: { S: '1' } } },
      { Items: [{ id: { S: '2' } }] },
    ]);

    const rows = await new AWSDynamoDBService(client.as<DynamoDBClient>()).query('table', 'pk = :pk', {
      ':pk': { S: 'value' },
    });

    assert.deepStrictEqual(rows, [{ id: '1' }, { id: '2' }]);
    assert.deepStrictEqual(client.inputs(QueryCommand)[1]?.['ExclusiveStartKey'], { id: { S: '1' } });
  });

  it('delegates get, update and put operations to DynamoDB', async () => {
    const client = new FakeAwsClient([{ Item: { id: { S: '1' } } }, {}, {}]);
    const service = new AWSDynamoDBService(client.as<DynamoDBClient>());

    assert.deepStrictEqual(await service.getItem('table', { id: '1' }), { id: '1' });
    await service.updateItem('table', { id: '1' }, 'SET #s = :status', { ':status': 'DONE' }, { '#s': 'status' });
    await service.putItem('table', { id: '2' });

    assert.deepStrictEqual(
      client.commands.map((command) => command.constructor),
      [GetItemCommand, UpdateItemCommand, PutItemCommand],
    );
  });
});
