import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import { createTestServiceRegistry } from '../../../../testing/createTestServiceRegistry.js';
import type { AwsAccountSelection } from '../../../../accounts/AwsAccountSelection.js';
import type { OperationalContext } from '../../../../services/OperationalContext.js';
import type { QueryLambdaAcrossAccountsConfig } from '../../types/QueryLambdaAcrossAccountsConfig.js';
import { QueryLambdaAcrossAccountsStep } from '../QueryLambdaAcrossAccountsStep.js';

type Rows = ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;
/** Rows a fake source returns for a query. */
type RowsForFn = (source: string, query: string) => Rows;

interface QueryCall {
  readonly source: string;
  readonly query: string;
}

const BASE: Omit<QueryLambdaAcrossAccountsConfig, 'queryKind' | 'sources'> = {
  queryProfileId: 'example',
  logGroup: '/aws/lambda/example',
  errorQuery: "fields @timestamp, @requestId, @message\n| filter @message like 'ERROR'\n| limit 1000",
  labels: { errors: 'Errori', invocation: 'Invocazioni', narrative: 'Example Lambda', report: 'Log Lambda' },
  errorVars: { checked: 'exampleChecked', total: 'exampleErrorCount', bySource: { a: 'exampleAErrorCount' } },
};

const ACCOUNTS: AwsAccountSelection = {
  subject: 'example',
  accounts: [
    { name: 'a', accountId: '111111111111', profiles: ['a'] },
    { name: 'b', accountId: '222222222222', profiles: ['b'] },
  ],
  scope: 'every-account',
  defaultRegion: 'eu-south-1',
};

function row(timestamp: string, requestId: string): ReadonlyArray<GOLogsInsightsResultField> {
  return [
    { field: '@timestamp', value: timestamp },
    { field: '@requestId', value: requestId },
  ];
}

function reader(source: string, calls: QueryCall[], rowsFor: RowsForFn): object {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async queryWithStatistics(_groups: ReadonlyArray<string>, query: string) {
      calls.push({ source, query });
      const rows = rowsFor(source, query);
      return {
        rows,
        statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
        queryExecutions: [],
      };
    },
  };
}

function context(
  params: ReadonlyArray<readonly [string, string]>,
  calls: QueryCall[],
  rowsFor: RowsForFn,
  errorRows?: Rows,
): OperationalContext {
  return {
    executionId: 'lambda-across-accounts-test',
    startedAt: new Date('2026-10-06T18:05:00.000Z'),
    stepResults: new Map(errorRows === undefined ? [] : [['query-lambda-errors', errorRows]]),
    vars: new Map(),
    params: new Map([['startTime', '2026-10-06T17:30:00Z'], ['endTime', '2026-10-06T18:05:00Z'], ...params]),
    logs: [],
    services: createTestServiceRegistry({
      cloudWatchLogs: {
        forTarget: (target: { accountId: string }) => reader(target.accountId, calls, rowsFor),
        getConfiguredSources: () => [
          { key: 'profile-x', service: reader('profile-x', calls, rowsFor) },
          { key: 'profile-y', service: reader('profile-y', calls, rowsFor) },
        ],
      },
    }),
    recoveredErrors: [],
  };
}

describe('QueryLambdaAcrossAccountsStep', () => {
  it('scans every account, tags the rows with the account and sorts them by timestamp', async () => {
    const calls: QueryCall[] = [];
    const step = new QueryLambdaAcrossAccountsStep({ ...BASE, queryKind: 'errors', sources: ACCOUNTS });
    const result = await step.execute(
      context([['awsProfiles', 'a,b']], calls, (source) =>
        source === '111111111111' ? [row('2026-10-06T18:00:02Z', 'r-a')] : [row('2026-10-06T18:00:01Z', 'r-b')],
      ),
    );
    assert.equal(step.id, 'query-lambda-errors');
    assert.equal(result.success, true);
    assert.deepEqual(
      result.output?.map((fields) => fields.find(({ field }) => field === 'sourceAccount')?.value),
      ['b', 'a'],
    );
    assert.deepEqual(result.vars, { exampleChecked: 'a,b', exampleErrorCount: '2', exampleAErrorCount: '1' });
    assert.equal(result.diagnostics?.cloudWatchLogs?.rowsReturned, 2);
  });

  it('fails an error scan at the row limit, because correlation needs every request id', async () => {
    const step = new QueryLambdaAcrossAccountsStep({ ...BASE, queryKind: 'errors', sources: ACCOUNTS });
    const result = await step.execute(
      context([['awsProfiles', 'a,b']], [], () => Array.from({ length: 1000 }, () => row('t', 'r'))),
    );
    assert.equal(result.success, false);
    assert.match(result.error ?? '', /a \(111111111111\) reached the 1000-row limit/u);
  });

  it('reconstructs only the request ids of each configured source', async () => {
    const calls: QueryCall[] = [];
    const errorRows: Rows = [
      [...row('t1', 'request-x'), { field: 'sourceKey', value: 'profile-x' }],
      [
        { field: '@message', value: 'ERROR without request id' },
        { field: 'sourceKey', value: 'profile-y' },
      ],
    ];
    const step = new QueryLambdaAcrossAccountsStep({ ...BASE, queryKind: 'invocation', sources: 'configured-sources' });
    const result = await step.execute(context([], calls, () => [row('t2', 'request-x')], errorRows));
    assert.equal(step.id, 'query-lambda-invocation');
    assert.equal(result.success, true);
    assert.deepEqual(
      calls.map(({ source }) => source),
      ['profile-x'],
    );
    assert.match(calls[0]?.query ?? '', /@requestId = 'request-x'/u);
    assert.equal(result.vars?.['lambdaInvocationLogCount'], '1');
    assert.equal(result.output?.[0]?.find(({ field }) => field === 'sourceKey')?.value, 'profile-x');
  });

  it('rejects an error row of an unknown source', async () => {
    const errorRows: Rows = [[...row('t1', 'request-x'), { field: 'sourceKey', value: 'elsewhere' }]];
    const step = new QueryLambdaAcrossAccountsStep({ ...BASE, queryKind: 'invocation', sources: 'configured-sources' });
    const result = await step.execute(context([], [], () => [], errorRows));
    assert.match(result.error ?? '', /invalid error-row source elsewhere/u);
  });
});
