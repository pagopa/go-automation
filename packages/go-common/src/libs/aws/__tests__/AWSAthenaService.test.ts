import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GetQueryExecutionCommand, GetQueryResultsCommand, StartQueryExecutionCommand } from '@aws-sdk/client-athena';
import type { AthenaClient } from '@aws-sdk/client-athena';

import { AWSAthenaService } from '../AWSAthenaService.js';

type AthenaCommand = StartQueryExecutionCommand | GetQueryExecutionCommand | GetQueryResultsCommand;

type AthenaResponse =
  | { readonly QueryExecutionId: string }
  | { readonly QueryExecution: { readonly Status: { readonly State: 'SUCCEEDED' } } }
  | {
      readonly ResultSet: {
        readonly Rows: ReadonlyArray<{
          readonly Data: ReadonlyArray<{ readonly VarCharValue?: string }>;
        }>;
      };
      readonly NextToken?: string;
    };

interface FakeAthenaClient {
  readonly commands: AthenaCommand[];
  send(command: AthenaCommand): Promise<AthenaResponse>;
}

function asAthenaClient(client: FakeAthenaClient): AthenaClient {
  return client as unknown as AthenaClient;
}

describe('AWSAthenaService', () => {
  it('executes a query, polls completion, and parses paginated result rows', async () => {
    const fakeClient: FakeAthenaClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();

        if (command instanceof StartQueryExecutionCommand) {
          return { QueryExecutionId: 'exec-1' };
        }
        if (command instanceof GetQueryExecutionCommand) {
          return { QueryExecution: { Status: { State: 'SUCCEEDED' } } };
        }
        if (this.commands.filter((entry) => entry instanceof GetQueryResultsCommand).length === 1) {
          return {
            ResultSet: {
              Rows: [
                { Data: [{ VarCharValue: 'id' }, { VarCharValue: 'status' }] },
                { Data: [{ VarCharValue: '1' }, { VarCharValue: 'OK' }] },
              ],
            },
            NextToken: 'next',
          };
        }
        return {
          ResultSet: {
            Rows: [{ Data: [{ VarCharValue: '2' }, { VarCharValue: 'KO' }] }],
          },
        };
      },
    };

    const service = new AWSAthenaService(asAthenaClient(fakeClient));

    const rows = await service.query('db', 'select * from table where id = ?', {
      parameters: ['1'],
      outputLocation: 's3://athena-results/',
    });

    assert.deepStrictEqual(rows, [
      { id: '1', status: 'OK' },
      { id: '2', status: 'KO' },
    ]);
    const startCommand = fakeClient.commands.find(
      (command): command is StartQueryExecutionCommand => command instanceof StartQueryExecutionCommand,
    );
    assert.strictEqual(startCommand?.input.ResultConfiguration?.OutputLocation, 's3://athena-results/');
    assert.deepStrictEqual(startCommand?.input.ExecutionParameters, ['1']);
    assert.strictEqual(fakeClient.commands.filter((command) => command instanceof GetQueryResultsCommand).length, 2);
  });

  it('omits ResultConfiguration when outputLocation is not provided', async () => {
    const fakeClient: FakeAthenaClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();

        if (command instanceof StartQueryExecutionCommand) {
          return { QueryExecutionId: 'exec-1' };
        }
        if (command instanceof GetQueryExecutionCommand) {
          return { QueryExecution: { Status: { State: 'SUCCEEDED' } } };
        }
        return {
          ResultSet: {
            Rows: [{ Data: [{ VarCharValue: 'id' }] }],
          },
        };
      },
    };

    const service = new AWSAthenaService(asAthenaClient(fakeClient));

    await service.query('db', 'select 1');

    const startCommand = fakeClient.commands.find(
      (command): command is StartQueryExecutionCommand => command instanceof StartQueryExecutionCommand,
    );
    assert.strictEqual(startCommand?.input.ResultConfiguration, undefined);
  });

  it('rejects invalid outputLocation values', async () => {
    const fakeClient: FakeAthenaClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        return { QueryExecutionId: 'exec-1' };
      },
    };
    const service = new AWSAthenaService(asAthenaClient(fakeClient));

    await assert.rejects(
      service.query('db', 'select 1', { outputLocation: 'https://example.com/results/' }),
      /Invalid Athena output location/,
    );
    assert.strictEqual(fakeClient.commands.length, 0);
  });
});
