import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  StartQueryExecutionCommand,
  StopQueryExecutionCommand,
} from '@aws-sdk/client-athena';
import type { AthenaClient } from '@aws-sdk/client-athena';

import { AWSAthenaService } from '../AWSAthenaService.js';
import type { GOSleeper } from '../../core/polling/index.js';

type AthenaCommand =
  StartQueryExecutionCommand | GetQueryExecutionCommand | GetQueryResultsCommand | StopQueryExecutionCommand;

type AthenaResponse =
  | Record<string, never>
  | { readonly QueryExecutionId: string }
  | {
      readonly QueryExecution: {
        readonly Status: {
          readonly State: 'QUEUED' | 'RUNNING' | 'SUCCEEDED';
          readonly SubmissionDateTime?: Date;
          readonly CompletionDateTime?: Date;
        };
      };
    }
  | {
      readonly ResultSet: {
        readonly ResultSetMetadata?: {
          readonly ColumnInfo: ReadonlyArray<{
            readonly Name?: string;
            readonly Type?: string;
          }>;
        };
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
  it('stops a remote Athena query once when execution is aborted', async () => {
    const controller = new AbortController();
    const fakeClient: FakeAthenaClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();
        if (command instanceof StartQueryExecutionCommand) {
          return { QueryExecutionId: 'exec-abort' };
        }
        if (command instanceof StopQueryExecutionCommand) {
          return {};
        }
        if (command instanceof GetQueryExecutionCommand) {
          controller.abort();
          return { QueryExecution: { Status: { State: 'RUNNING' } } };
        }
        return { ResultSet: { Rows: [] } };
      },
    };
    const service = new AWSAthenaService(asAthenaClient(fakeClient));

    await assert.rejects(
      service.executeQuery('db', 'select 1', {
        signal: controller.signal,
        maxPollAttempts: 2,
        pollIntervalMs: 1,
      }),
    );

    assert.strictEqual(fakeClient.commands.filter((command) => command instanceof StopQueryExecutionCommand).length, 1);
  });

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

  it('returns rich metadata and passes catalog/workgroup to Athena', async () => {
    const fakeClient: FakeAthenaClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();

        if (command instanceof StartQueryExecutionCommand) {
          return { QueryExecutionId: 'exec-rich' };
        }
        if (command instanceof GetQueryExecutionCommand) {
          return {
            QueryExecution: {
              Status: {
                State: 'SUCCEEDED',
                SubmissionDateTime: new Date('2026-05-01T10:00:00Z'),
                CompletionDateTime: new Date('2026-05-01T10:00:02Z'),
              },
            },
          };
        }
        return {
          ResultSet: {
            ResultSetMetadata: {
              ColumnInfo: [
                { Name: 'id', Type: 'varchar' },
                { Name: 'count', Type: 'bigint' },
              ],
            },
            Rows: [
              { Data: [{ VarCharValue: 'id' }, { VarCharValue: 'count' }] },
              { Data: [{ VarCharValue: 'a' }, { VarCharValue: '2' }] },
            ],
          },
        };
      },
    };

    const service = new AWSAthenaService(asAthenaClient(fakeClient));
    const result = await service.executeQuery('db', 'select * from table', {
      catalog: 'AwsDataCatalog',
      workGroup: 'wg',
      outputLocation: 's3://athena-results/path/',
    });

    assert.strictEqual(result.executionId, 'exec-rich');
    assert.strictEqual(result.database, 'db');
    assert.strictEqual(result.catalog, 'AwsDataCatalog');
    assert.strictEqual(result.workGroup, 'wg');
    assert.strictEqual(result.durationMs, 2000);
    assert.deepStrictEqual(result.columns, [
      { name: 'id', type: 'varchar' },
      { name: 'count', type: 'bigint' },
    ]);
    assert.deepStrictEqual(result.rows, [{ id: 'a', count: '2' }]);

    const startCommand = fakeClient.commands.find(
      (command): command is StartQueryExecutionCommand => command instanceof StartQueryExecutionCommand,
    );
    assert.strictEqual(startCommand?.input.QueryExecutionContext?.Catalog, 'AwsDataCatalog');
    assert.strictEqual(startCommand?.input.WorkGroup, 'wg');
  });

  it('skips unnamed Athena columns instead of writing empty record keys', async () => {
    const fakeClient: FakeAthenaClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();

        if (command instanceof StartQueryExecutionCommand) {
          return { QueryExecutionId: 'exec-unnamed' };
        }
        if (command instanceof GetQueryExecutionCommand) {
          return { QueryExecution: { Status: { State: 'SUCCEEDED' } } };
        }
        return {
          ResultSet: {
            ResultSetMetadata: {
              ColumnInfo: [{ Name: 'id', Type: 'varchar' }, { Type: 'varchar' }, { Name: 'status', Type: 'varchar' }],
            },
            Rows: [
              { Data: [{ VarCharValue: 'id' }, { VarCharValue: '' }, { VarCharValue: 'status' }] },
              { Data: [{ VarCharValue: '1' }, { VarCharValue: 'discarded' }, { VarCharValue: 'OK' }] },
            ],
          },
        };
      },
    };

    const service = new AWSAthenaService(asAthenaClient(fakeClient));
    const result = await service.executeQuery('db', 'select 1');

    assert.deepStrictEqual(result.columns, [
      { name: 'id', type: 'varchar' },
      { name: 'status', type: 'varchar' },
    ]);
    assert.deepStrictEqual(result.rows, [{ id: '1', status: 'OK' }]);
    assert.strictEqual(Object.hasOwn(result.rows[0] ?? {}, ''), false);
  });

  it('uses configured polling interval and sleeper', async () => {
    const sleeper: GOSleeper & { readonly calls: number[] } = {
      calls: [],
      async sleep(ms: number): Promise<void> {
        this.calls.push(ms);
        return Promise.resolve();
      },
    };
    let statusChecks = 0;
    const fakeClient: FakeAthenaClient = {
      commands: [],
      async send(command) {
        this.commands.push(command);
        await Promise.resolve();

        if (command instanceof StartQueryExecutionCommand) {
          return { QueryExecutionId: 'exec-poll' };
        }
        if (command instanceof GetQueryExecutionCommand) {
          statusChecks += 1;
          return {
            QueryExecution: {
              Status: {
                State: statusChecks === 1 ? 'RUNNING' : 'SUCCEEDED',
              },
            },
          };
        }
        return {
          ResultSet: {
            Rows: [{ Data: [{ VarCharValue: 'id' }] }],
          },
        };
      },
    };

    const service = new AWSAthenaService(asAthenaClient(fakeClient));
    await service.executeQuery('db', 'select 1', {
      maxPollAttempts: 3,
      pollIntervalMs: 123,
      sleeper,
    });

    assert.deepStrictEqual(sleeper.calls, [123]);
    assert.strictEqual(statusChecks, 2);
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
