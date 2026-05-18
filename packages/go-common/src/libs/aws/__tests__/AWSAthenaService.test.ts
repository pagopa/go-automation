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

    const service = new AWSAthenaService(asAthenaClient(fakeClient), 's3://athena-results/');

    const rows = await service.query('db', 'select * from table where id = ?', ['1']);

    assert.deepStrictEqual(rows, [
      { id: '1', status: 'OK' },
      { id: '2', status: 'KO' },
    ]);
    assert.strictEqual(fakeClient.commands.filter((command) => command instanceof GetQueryResultsCommand).length, 2);
  });
});
