import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BatchWriteItemCommand,
  DeleteItemCommand,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';

import { AWSDynamoDBService } from '../AWSDynamoDBService.js';

type DynamoDBCommand =
  | QueryCommand
  | GetItemCommand
  | UpdateItemCommand
  | PutItemCommand
  | ScanCommand
  | BatchWriteItemCommand
  | DeleteItemCommand;

type DynamoDBResponse =
  | {
      readonly Items?: ReadonlyArray<Record<string, { readonly S: string }>>;
      readonly LastEvaluatedKey?: Record<string, { readonly S: string }>;
    }
  | { readonly Item?: Record<string, { readonly S: string }> }
  | { readonly UnprocessedItems?: Record<string, ReadonlyArray<unknown>> }
  | Record<string, never>;

/** An item in wire form, the shape both new write methods take. */
function wire(cap: string): Record<string, unknown> {
  return { cap: { S: cap } };
}

/** The `UnprocessedItems` entry DynamoDB returns for a rejected put. */
function rejected(items: ReadonlyArray<Record<string, unknown>>): ReadonlyArray<unknown> {
  return items.map((item) => ({ PutRequest: { Item: item } }));
}

interface FakeDynamoDBClient {
  readonly commands: DynamoDBCommand[];
  send(command: DynamoDBCommand): Promise<DynamoDBResponse>;
}

function asDynamoDBClient(client: FakeDynamoDBClient): DynamoDBClient {
  return client as unknown as DynamoDBClient;
}

describe('AWSDynamoDBService.scanRaw', () => {
  it('reads every page, because a partial scan reads as missing items', async () => {
    let scanCalls = 0;
    const fakeClient: FakeDynamoDBClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();

        scanCalls += 1;
        if (scanCalls === 1) {
          return { Items: [{ cap: { S: '83030' } }], LastEvaluatedKey: { cap: { S: '83030' } } };
        }
        return { Items: [{ cap: { S: '00100' } }] };
      },
    };

    const items = await new AWSDynamoDBService(asDynamoDBClient(fakeClient)).scanRaw('pn-addressManager-Cap');

    assert.equal(fakeClient.commands.filter((command) => command instanceof ScanCommand).length, 2);
    assert.equal(items.length, 2);
  });

  it('hands the start key of one page to the next', async () => {
    let scanCalls = 0;
    const fakeClient: FakeDynamoDBClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();

        scanCalls += 1;
        return scanCalls === 1 ? { Items: [], LastEvaluatedKey: { cap: { S: '83030' } } } : { Items: [] };
      },
    };

    await new AWSDynamoDBService(asDynamoDBClient(fakeClient)).scanRaw('pn-addressManager-Cap');

    const second = fakeClient.commands[1];
    assert.ok(second instanceof ScanCommand);
    assert.deepEqual(second.input.ExclusiveStartKey, { cap: { S: '83030' } });
  });

  it('keeps items in their wire form rather than unmarshalling them', async () => {
    // The whole point: a parity check compares representations. Unmarshalling
    // would turn {"NULL":true} into null and lose the distinction this reads.
    const fakeClient: FakeDynamoDBClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        return { Items: [{ cap: { S: '83030' }, startValidity: { NULL: true } } as never] };
      },
    };

    const items = await new AWSDynamoDBService(asDynamoDBClient(fakeClient)).scanRaw('pn-addressManager-Cap');

    assert.deepEqual(items[0], { cap: { S: '83030' }, startValidity: { NULL: true } });
  });

  it('returns nothing for an empty table without looping', async () => {
    const fakeClient: FakeDynamoDBClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        return {};
      },
    };

    const items = await new AWSDynamoDBService(asDynamoDBClient(fakeClient)).scanRaw('pn-EcAnagrafica');

    assert.deepEqual([...items], []);
    assert.equal(fakeClient.commands.length, 1);
  });
});

describe('AWSDynamoDBService.updateItemRaw', () => {
  /** A client that records commands and answers everything with an empty response. */
  function recorder(): FakeDynamoDBClient {
    return {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        return {};
      },
    };
  }

  it('sets only the attributes it was given, leaving the rest of the item alone', async () => {
    const fakeClient = recorder();

    await new AWSDynamoDBService(asDynamoDBClient(fakeClient)).updateItemRaw(
      'pn-AuthJwtIssuers',
      { hashKey: { S: 'issuer' }, sortKey: { S: 'CFG' } },
      { jwksUrl: { S: 'https://example' }, enabled: { BOOL: true } },
    );

    const command = fakeClient.commands[0];
    assert.ok(command instanceof UpdateItemCommand);
    assert.equal(command.input.UpdateExpression, 'SET #a0 = :a0, #a1 = :a1');
    assert.deepEqual(command.input.ExpressionAttributeNames, { '#a0': 'jwksUrl', '#a1': 'enabled' });
    assert.deepEqual(command.input.ExpressionAttributeValues, {
      ':a0': { S: 'https://example' },
      ':a1': { BOOL: true },
    });
  });

  it('passes the key through in wire form instead of marshalling it again', async () => {
    const fakeClient = recorder();

    await new AWSDynamoDBService(asDynamoDBClient(fakeClient)).updateItemRaw(
      'pn-AuthJwtIssuers',
      { hashKey: { S: 'issuer' } },
      { enabled: { BOOL: false } },
    );

    const command = fakeClient.commands[0];
    assert.ok(command instanceof UpdateItemCommand);
    assert.deepEqual(command.input.Key, { hashKey: { S: 'issuer' } });
  });

  it('names an attribute whose placeholder could not be derived from it', async () => {
    // `#custom:tag` is not a legal expression attribute name, so deriving the
    // placeholder from the attribute would fail on this item and only on this
    // item. Positional placeholders make the attribute name irrelevant.
    const fakeClient = recorder();

    await new AWSDynamoDBService(asDynamoDBClient(fakeClient)).updateItemRaw(
      'pn-SmStates',
      { processClientId: { S: 'PEC' } },
      { 'custom:tag': { S: 'x' }, 'dotted.name': { S: 'y' } },
    );

    const command = fakeClient.commands[0];
    assert.ok(command instanceof UpdateItemCommand);
    assert.equal(command.input.UpdateExpression, 'SET #a0 = :a0, #a1 = :a1');
    assert.deepEqual(command.input.ExpressionAttributeNames, { '#a0': 'custom:tag', '#a1': 'dotted.name' });
  });

  it('refuses an item carrying nothing beyond its key, rather than sending an empty SET', async () => {
    const fakeClient = recorder();

    await assert.rejects(
      async () =>
        await new AWSDynamoDBService(asDynamoDBClient(fakeClient)).updateItemRaw(
          'pn-AuthJwtIssuers',
          { hashKey: { S: 'issuer' } },
          {},
        ),
      /No attribute to update on 'pn-AuthJwtIssuers'/,
    );
    assert.equal(fakeClient.commands.length, 0);
  });
});

describe('AWSDynamoDBService.batchWriteItemRaw', () => {
  it('splits the items into requests of at most 25', async () => {
    const fakeClient: FakeDynamoDBClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        return {};
      },
    };

    const items = Array.from({ length: 60 }, (_, index) => wire(String(index)));
    const result = await new AWSDynamoDBService(asDynamoDBClient(fakeClient)).batchWriteItemRaw(
      'pn-addressManager-Cap',
      items,
    );

    assert.equal(fakeClient.commands.length, 3);
    assert.equal(result.written, 60);
    assert.deepEqual([...result.unprocessed], []);
  });

  it('caps a larger requested batch size at the limit DynamoDB enforces', async () => {
    const fakeClient: FakeDynamoDBClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        return {};
      },
    };

    const items = Array.from({ length: 30 }, (_, index) => wire(String(index)));
    await new AWSDynamoDBService(asDynamoDBClient(fakeClient)).batchWriteItemRaw('pn-addressManager-Cap', items, {
      batchSize: 100,
    });

    assert.equal(fakeClient.commands.length, 2);
  });

  it('re-sends the unprocessed part of a batch and counts only what was written', async () => {
    // The defect this method exists for: DynamoDB answers a throttled batch
    // with HTTP 200 and the rejected items in the body, so counting the batch
    // as written reports data that never landed.
    let calls = 0;
    const fakeClient: FakeDynamoDBClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        calls += 1;
        if (calls === 1) {
          return { UnprocessedItems: { 'pn-addressManager-Cap': rejected([wire('b'), wire('c')]) } };
        }
        if (calls === 2) {
          return { UnprocessedItems: { 'pn-addressManager-Cap': rejected([wire('c')]) } };
        }
        return {};
      },
    };

    const retries: number[] = [];
    const result = await new AWSDynamoDBService(asDynamoDBClient(fakeClient)).batchWriteItemRaw(
      'pn-addressManager-Cap',
      [wire('a'), wire('b'), wire('c')],
      { onRetry: (remaining) => retries.push(remaining) },
    );

    assert.equal(fakeClient.commands.length, 3);
    assert.equal(result.written, 3);
    assert.deepEqual([...result.unprocessed], []);
    assert.deepEqual(retries, [2, 1]);
  });

  it('retries only the rejected items, never the ones already accepted', async () => {
    let calls = 0;
    const fakeClient: FakeDynamoDBClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        calls += 1;
        return calls === 1 ? { UnprocessedItems: { 'pn-SmStates': rejected([wire('c')]) } } : {};
      },
    };

    await new AWSDynamoDBService(asDynamoDBClient(fakeClient)).batchWriteItemRaw('pn-SmStates', [
      wire('a'),
      wire('b'),
      wire('c'),
    ]);

    const second = fakeClient.commands[1];
    assert.ok(second instanceof BatchWriteItemCommand);
    assert.deepEqual(second.input.RequestItems?.['pn-SmStates'], [{ PutRequest: { Item: wire('c') } }]);
  });

  it('returns what it could not write instead of reporting a full success', async () => {
    const fakeClient: FakeDynamoDBClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        return { UnprocessedItems: { 'pn-SmStates': rejected([wire('b')]) } };
      },
    };

    const result = await new AWSDynamoDBService(asDynamoDBClient(fakeClient)).batchWriteItemRaw(
      'pn-SmStates',
      [wire('a'), wire('b')],
      { maxRetries: 1 },
    );

    // Two attempts: the first, then one retry. Then it gives up and says so.
    assert.equal(fakeClient.commands.length, 2);
    assert.equal(result.written, 1);
    assert.deepEqual([...result.unprocessed], [wire('b')]);
  });

  it('writes puts only, so an item absent from the list is left in the table', async () => {
    const fakeClient: FakeDynamoDBClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        return {};
      },
    };

    await new AWSDynamoDBService(asDynamoDBClient(fakeClient)).batchWriteItemRaw('pn-PaperZone', [wire('a')]);

    const command = fakeClient.commands[0];
    assert.ok(command instanceof BatchWriteItemCommand);
    const requests = command.input.RequestItems?.['pn-PaperZone'] ?? [];
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0], { PutRequest: { Item: wire('a') } });
    assert.equal('DeleteRequest' in (requests[0] ?? {}), false);
  });

  it('sends nothing at all for an empty list', async () => {
    const fakeClient: FakeDynamoDBClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        return {};
      },
    };

    const result = await new AWSDynamoDBService(asDynamoDBClient(fakeClient)).batchWriteItemRaw('pn-PaperZone', []);

    assert.equal(fakeClient.commands.length, 0);
    assert.equal(result.written, 0);
  });
});
