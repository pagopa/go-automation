import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AWSCloudWatchLogsQueryService, GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import { CORE, EXTRA, port, REGION } from '../../../../accounts/__tests__/fixtures.js';
import type { AwsAccountSelection } from '../../../../accounts/AwsAccountSelection.js';
import type { OperationalContext } from '../../../../services/OperationalContext.js';
import { createTestServiceRegistry } from '../../../../testing/createTestServiceRegistry.js';
import type { InMemoryAwsAccountsPort } from '../../../../testing/InMemoryAwsAccountsPort.js';
import type { InMemoryAwsAccountsPortOptions } from '../../../../testing/InMemoryAwsAccountsPortOptions.js';
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
  errorVars: { checked: 'exampleChecked', total: 'exampleErrorCount', bySource: { core: 'exampleCoreErrorCount' } },
};

const ACCOUNTS: AwsAccountSelection = { subject: 'example', accounts: [CORE, EXTRA], scope: 'every-account' };

function row(timestamp: string, requestId: string): ReadonlyArray<GOLogsInsightsResultField> {
  return [
    { field: '@timestamp', value: timestamp },
    { field: '@requestId', value: requestId },
  ];
}

function reader(source: string, calls: QueryCall[], rowsFor: RowsForFn): AWSCloudWatchLogsQueryService {
  return createTestServiceRegistry({
    cloudWatchLogs: {
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
    },
  }).cloudWatchLogs;
}

/**
 * Account port over the synthetic directory, with the readers of both accounts prepared
 * as the pre-execution check would.
 */
async function accountsPort(
  calls: QueryCall[],
  rowsFor: RowsForFn,
  options: Partial<InMemoryAwsAccountsPortOptions> = { environment: 'prod' },
): Promise<InMemoryAwsAccountsPort> {
  const awsAccounts = port({
    ...options,
    readers: { [CORE]: reader(CORE, calls, rowsFor), [EXTRA]: reader(EXTRA, calls, rowsFor) },
  });
  await awsAccounts.prepare([CORE, EXTRA]);
  return awsAccounts;
}

function context(
  calls: QueryCall[],
  rowsFor: RowsForFn,
  errorRows?: Rows,
  awsAccounts?: InMemoryAwsAccountsPort,
): OperationalContext {
  return {
    executionId: 'lambda-across-accounts-test',
    startedAt: new Date('2026-10-06T18:05:00.000Z'),
    stepResults: new Map(errorRows === undefined ? [] : [['query-lambda-errors', errorRows]]),
    vars: new Map(),
    params: new Map([
      ['startTime', '2026-10-06T17:30:00Z'],
      ['endTime', '2026-10-06T18:05:00Z'],
    ]),
    logs: [],
    services: createTestServiceRegistry({
      ...(awsAccounts === undefined ? {} : { awsAccounts }),
      cloudWatchLogs: {
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
  it('scans every account, tags the rows with the account name and sorts them by timestamp', async () => {
    const calls: QueryCall[] = [];
    const rowsFor: RowsForFn = (source) =>
      source === CORE ? [row('2026-10-06T18:00:02Z', 'r-core')] : [row('2026-10-06T18:00:01Z', 'r-extra')];
    const step = new QueryLambdaAcrossAccountsStep({ ...BASE, queryKind: 'errors', sources: ACCOUNTS });
    const result = await step.execute(context(calls, rowsFor, undefined, await accountsPort(calls, rowsFor)));
    assert.equal(step.id, 'query-lambda-errors');
    assert.equal(result.success, true);
    assert.deepEqual(
      calls.map(({ source }) => source),
      [CORE, EXTRA],
    );
    assert.deepEqual(
      result.output?.map((fields) => fields.find(({ field }) => field === 'sourceAccount')?.value),
      ['extra', 'core'],
    );
    assert.deepEqual(result.vars, {
      exampleChecked: 'core,extra',
      exampleErrorCount: '2',
      exampleCoreErrorCount: '1',
    });
    assert.equal(result.diagnostics?.cloudWatchLogs?.rowsReturned, 2);
  });

  it('declares its selection and the account port only when it reads logical accounts', () => {
    const accounts = new QueryLambdaAcrossAccountsStep({ ...BASE, queryKind: 'errors', sources: ACCOUNTS });
    const configured = new QueryLambdaAcrossAccountsStep({
      ...BASE,
      queryKind: 'errors',
      sources: 'configured-sources',
    });
    assert.deepEqual(accounts.accountSelections(), [ACCOUNTS]);
    assert.deepEqual(accounts.requiredServices(), ['cloudWatchLogs', 'awsAccounts']);
    assert.deepEqual(configured.accountSelections(), []);
    assert.deepEqual(configured.requiredServices(), ['cloudWatchLogs']);
  });

  it('traces the logical accounts it reads', () => {
    const step = new QueryLambdaAcrossAccountsStep({ ...BASE, queryKind: 'errors', sources: ACCOUNTS });
    assert.deepEqual(step.getTraceInfo(context([], () => []))['sources'], [CORE, EXTRA]);
  });

  it('reads the accounts of the occurrence environment', async () => {
    const calls: QueryCall[] = [];
    const awsAccounts = await accountsPort(calls, () => [], {
      occurrence: { accountId: '000000000202', region: REGION },
    });
    const step = new QueryLambdaAcrossAccountsStep({ ...BASE, queryKind: 'errors', sources: ACCOUNTS });
    const result = await step.execute(context(calls, () => [], undefined, awsAccounts));
    assert.equal(result.success, true);
    assert.equal(result.vars?.['exampleChecked'], 'core,extra');
    assert.deepEqual(
      calls.map(({ source }) => source),
      [CORE, EXTRA],
    );
    assert.deepEqual(
      awsAccounts.resolvedAccounts().map(({ accountId }) => accountId),
      ['000000000201', '000000000202'],
    );
  });

  it('fails without querying when the occurrence is outside the selection', async () => {
    const calls: QueryCall[] = [];
    const awsAccounts = port({ occurrence: { accountId: '000000000103', region: REGION } });
    const step = new QueryLambdaAcrossAccountsStep({ ...BASE, queryKind: 'errors', sources: ACCOUNTS });
    const result = await step.execute(context(calls, () => [], undefined, awsAccounts));
    assert.equal(result.success, false);
    assert.match(result.error ?? '', /The occurrence account is none of example's accounts/u);
    assert.deepEqual(calls, []);
  });

  it('fails when the account port is missing', async () => {
    const step = new QueryLambdaAcrossAccountsStep({ ...BASE, queryKind: 'errors', sources: ACCOUNTS });
    const result = await step.execute(context([], () => []));
    assert.equal(result.success, false);
    assert.match(result.error ?? '', /account port is required/u);
  });

  it('fails an error scan at the row limit, because correlation needs every request id', async () => {
    const rowsFor: RowsForFn = () => Array.from({ length: 1000 }, () => row('t', 'r'));
    const step = new QueryLambdaAcrossAccountsStep({ ...BASE, queryKind: 'errors', sources: ACCOUNTS });
    const result = await step.execute(context([], rowsFor, undefined, await accountsPort([], rowsFor)));
    assert.equal(result.success, false);
    assert.match(result.error ?? '', /core \(000000000101\) reached the 1000-row limit/u);
  });

  it('reconstructs only the request ids of each logical account', async () => {
    const calls: QueryCall[] = [];
    const rowsFor: RowsForFn = () => [row('t2', 'request-e')];
    const errorRows: Rows = [
      [...row('t1', 'request-e'), { field: 'sourceAccount', value: 'extra' }],
      [
        { field: '@message', value: 'ERROR without request id' },
        { field: 'sourceAccount', value: 'core' },
      ],
    ];
    const step = new QueryLambdaAcrossAccountsStep({ ...BASE, queryKind: 'invocation', sources: ACCOUNTS });
    const result = await step.execute(context(calls, rowsFor, errorRows, await accountsPort(calls, rowsFor)));
    assert.equal(step.id, 'query-lambda-invocation');
    assert.equal(result.success, true);
    assert.deepEqual(
      calls.map(({ source }) => source),
      [EXTRA],
    );
    assert.match(calls[0]?.query ?? '', /@requestId = 'request-e'/u);
    assert.equal(result.output?.[0]?.find(({ field }) => field === 'sourceAccount')?.value, 'extra');
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
    const result = await step.execute(context(calls, () => [row('t2', 'request-x')], errorRows));
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
    const result = await step.execute(context([], () => [], errorRows));
    assert.match(result.error ?? '', /invalid error-row source elsewhere/u);
  });
});
