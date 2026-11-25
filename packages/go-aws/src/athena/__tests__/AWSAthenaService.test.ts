import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  StartQueryExecutionCommand,
  StopQueryExecutionCommand,
  type AthenaClient,
} from '@aws-sdk/client-athena';
import type { GOSleeper } from '@pagopa/go-common/polling';

import { FakeAwsClient } from '../../__tests__/helpers/FakeAwsClient.js';
import { AWSAthenaService } from '../AWSAthenaService.js';

/** Called on every execution status check. */
type StatusCheckHook = () => void;

/** Scripted Athena: the execution statuses (the last one repeats) and the result pages. */
interface AthenaScript {
  readonly statuses?: ReadonlyArray<object>;
  readonly pages?: ReadonlyArray<object>;
  readonly onStatusCheck?: StatusCheckHook;
}

function athenaClient(script: AthenaScript = {}): FakeAwsClient {
  const statuses = script.statuses ?? [{ State: 'SUCCEEDED' }];
  const pages = [...(script.pages ?? [{ ResultSet: { Rows: [row('id')] } }])];
  let checks = 0;
  return new FakeAwsClient((command) => {
    if (command instanceof StartQueryExecutionCommand) return { QueryExecutionId: 'exec-1' };
    if (command instanceof StopQueryExecutionCommand) return {};
    if (command instanceof GetQueryExecutionCommand) {
      script.onStatusCheck?.();
      const status = statuses[Math.min(checks, statuses.length - 1)];
      checks += 1;
      return { QueryExecution: { Status: status } };
    }
    return pages.shift() ?? new Error('No result page left');
  });
}

/** A result row with the given cell values. */
function row(...values: ReadonlyArray<string>): object {
  return { Data: values.map((value) => ({ VarCharValue: value })) };
}

function serviceOf(client: FakeAwsClient): AWSAthenaService {
  return new AWSAthenaService(client.as<AthenaClient>());
}

describe('AWSAthenaService', () => {
  it('stops a remote Athena query once when execution is aborted', async () => {
    const controller = new AbortController();
    const client = athenaClient({ statuses: [{ State: 'RUNNING' }], onStatusCheck: () => controller.abort() });

    await assert.rejects(
      serviceOf(client).executeQuery('db', 'select 1', {
        signal: controller.signal,
        maxPollAttempts: 2,
        pollIntervalMs: 1,
      }),
    );

    assert.strictEqual(client.sent(StopQueryExecutionCommand).length, 1);
  });

  it('executes a query, polls completion, and parses paginated result rows', async () => {
    const client = athenaClient({
      pages: [
        { ResultSet: { Rows: [row('id', 'status'), row('1', 'OK')] }, NextToken: 'next' },
        { ResultSet: { Rows: [row('2', 'KO')] } },
      ],
    });

    const rows = await serviceOf(client).query('db', 'select * from table where id = ?', {
      parameters: ['1'],
      outputLocation: 's3://athena-results/',
    });

    assert.deepStrictEqual(rows, [
      { id: '1', status: 'OK' },
      { id: '2', status: 'KO' },
    ]);
    const [start] = client.sent(StartQueryExecutionCommand);
    assert.strictEqual(start?.input.ResultConfiguration?.OutputLocation, 's3://athena-results/');
    assert.deepStrictEqual(start?.input.ExecutionParameters, ['1']);
    assert.strictEqual(client.sent(GetQueryResultsCommand).length, 2);
  });

  it('returns rich metadata and passes catalog/workgroup to Athena', async () => {
    const client = athenaClient({
      statuses: [
        {
          State: 'SUCCEEDED',
          SubmissionDateTime: new Date('2026-05-01T10:00:00Z'),
          CompletionDateTime: new Date('2026-05-01T10:00:02Z'),
        },
      ],
      pages: [
        {
          ResultSet: {
            ResultSetMetadata: {
              ColumnInfo: [
                { Name: 'id', Type: 'varchar' },
                { Name: 'count', Type: 'bigint' },
              ],
            },
            Rows: [row('id', 'count'), row('a', '2')],
          },
        },
      ],
    });

    const result = await serviceOf(client).executeQuery('db', 'select * from table', {
      catalog: 'AwsDataCatalog',
      workGroup: 'wg',
      outputLocation: 's3://athena-results/path/',
    });

    assert.strictEqual(result.executionId, 'exec-1');
    assert.strictEqual(result.database, 'db');
    assert.strictEqual(result.catalog, 'AwsDataCatalog');
    assert.strictEqual(result.workGroup, 'wg');
    assert.strictEqual(result.durationMs, 2000);
    assert.deepStrictEqual(result.columns, [
      { name: 'id', type: 'varchar' },
      { name: 'count', type: 'bigint' },
    ]);
    assert.deepStrictEqual(result.rows, [{ id: 'a', count: '2' }]);
    const [start] = client.sent(StartQueryExecutionCommand);
    assert.strictEqual(start?.input.QueryExecutionContext?.Catalog, 'AwsDataCatalog');
    assert.strictEqual(start?.input.WorkGroup, 'wg');
  });

  it('skips unnamed Athena columns and omits ResultConfiguration without an output location', async () => {
    const client = athenaClient({
      pages: [
        {
          ResultSet: {
            ResultSetMetadata: {
              ColumnInfo: [{ Name: 'id', Type: 'varchar' }, { Type: 'varchar' }, { Name: 'status', Type: 'varchar' }],
            },
            Rows: [row('id', '', 'status'), row('1', 'discarded', 'OK')],
          },
        },
      ],
    });

    const result = await serviceOf(client).executeQuery('db', 'select 1');

    assert.deepStrictEqual(result.columns, [
      { name: 'id', type: 'varchar' },
      { name: 'status', type: 'varchar' },
    ]);
    assert.deepStrictEqual(result.rows, [{ id: '1', status: 'OK' }]);
    assert.strictEqual(Object.hasOwn(result.rows[0] ?? {}, ''), false);
    assert.strictEqual(client.sent(StartQueryExecutionCommand)[0]?.input.ResultConfiguration, undefined);
  });

  it('uses configured polling interval and sleeper', async () => {
    const sleeper: GOSleeper & { readonly calls: number[] } = {
      calls: [],
      async sleep(ms: number): Promise<void> {
        this.calls.push(ms);
        return Promise.resolve();
      },
    };
    const client = athenaClient({ statuses: [{ State: 'RUNNING' }, { State: 'SUCCEEDED' }] });

    await serviceOf(client).executeQuery('db', 'select 1', { maxPollAttempts: 3, pollIntervalMs: 123, sleeper });

    assert.deepStrictEqual(sleeper.calls, [123]);
    assert.strictEqual(client.sent(GetQueryExecutionCommand).length, 2);
  });

  it('rejects invalid outputLocation values', async () => {
    const client = athenaClient();

    await assert.rejects(
      serviceOf(client).query('db', 'select 1', { outputLocation: 'https://example.com/results/' }),
      /Invalid Athena output location/,
    );
    assert.strictEqual(client.commands.length, 0);
  });
});
