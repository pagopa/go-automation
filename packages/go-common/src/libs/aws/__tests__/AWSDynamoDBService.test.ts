import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GetItemCommand, PutItemCommand, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';

import { AWSDynamoDBService } from '../AWSDynamoDBService.js';

type DynamoDBCommand = QueryCommand | GetItemCommand | UpdateItemCommand | PutItemCommand;

type DynamoDBResponse =
  | {
      readonly Items?: ReadonlyArray<Record<string, { readonly S: string }>>;
      readonly LastEvaluatedKey?: Record<string, { readonly S: string }>;
    }
  | { readonly Item?: Record<string, { readonly S: string }> }
  | Record<string, never>;

interface FakeDynamoDBClient {
  readonly commands: DynamoDBCommand[];
  send(command: DynamoDBCommand): Promise<DynamoDBResponse>;
}

function asDynamoDBClient(client: FakeDynamoDBClient): DynamoDBClient {
  return client as unknown as DynamoDBClient;
}

describe('AWSDynamoDBService', () => {
  it('queries with pagination and unmarshalls items', async () => {
    let queryCalls = 0;
    const fakeClient: FakeDynamoDBClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();

        if (command instanceof QueryCommand) {
          queryCalls += 1;
          if (queryCalls === 1) {
            return {
              Items: [{ id: { S: '1' } }],
              LastEvaluatedKey: { id: { S: '1' } },
            };
          }
          return { Items: [{ id: { S: '2' } }] };
        }

        return {};
      },
    };

    const service = new AWSDynamoDBService(asDynamoDBClient(fakeClient));

    const rows = await service.query('table', 'pk = :pk', { ':pk': { S: 'value' } });

    assert.deepStrictEqual(rows, [{ id: '1' }, { id: '2' }]);
    assert.strictEqual(fakeClient.commands.filter((command) => command instanceof QueryCommand).length, 2);
  });

  it('delegates get, update and put operations to DynamoDB', async () => {
    const fakeClient: FakeDynamoDBClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        if (command instanceof GetItemCommand) {
          return { Item: { id: { S: '1' } } };
        }
        return {};
      },
    };

    const service = new AWSDynamoDBService(asDynamoDBClient(fakeClient));

    assert.deepStrictEqual(await service.getItem('table', { id: '1' }), { id: '1' });
    await service.updateItem('table', { id: '1' }, 'SET #s = :status', { ':status': 'DONE' }, { '#s': 'status' });
    await service.putItem('table', { id: '2' });

    assert.ok(fakeClient.commands[0] instanceof GetItemCommand);
    assert.ok(fakeClient.commands[1] instanceof UpdateItemCommand);
    assert.ok(fakeClient.commands[2] instanceof PutItemCommand);
  });
});
