import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import {
  awsLogicalAccountName,
  createTestServiceRegistry,
  lambda,
  SEND_ACCOUNTS,
} from '../../../../../toolkits/send/index.js';
import { ConditionEvaluator } from '../../../../../engine/index.js';
import { KNOWN_CASES } from '../knownCases.js';
import { LAMBDA_LOG_READER } from '../lambdaLogReader.js';
import type { OperationalContext } from '../../../../../toolkits/common/services/OperationalContext.js';
import type { InMemoryAwsAccountsPortOptions } from '../../../../../toolkits/common/testing/InMemoryAwsAccountsPortOptions.js';
import { rejectsWith } from '../../../../../toolkits/common/accounts/__tests__/fixtures.js';
import {
  fakeReader,
  occurrenceIn,
  prepareSelections,
  SEND_ACCOUNT_IDS,
  sendAccountsPort,
} from '../../../../../toolkits/send/accounts/__tests__/fixtures.js';

interface QueryCall {
  readonly account: string;
  readonly groups: ReadonlyArray<string>;
  readonly query: string;
  readonly paginateResults?: boolean;
}

type Rows = ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;
type RowsForQueryFn = (account: string, query: string) => Rows;
type PortOptions = Partial<InMemoryAwsAccountsPortOptions>;

const CORE_REQUEST_ID = 'b95bb742-cc30-4f07-80bc-45a38011e5c4';
const SECOND_CORE_REQUEST_ID = '1a1bf5ea-2088-4ea7-9133-12fcbfaabacc';
const CONFINFO_REQUEST_ID = 'd848f0c5-1089-5c2b-9a3b-91a94511ee52';
/** Local execution in production, without an occurrence. */
const PROD: PortOptions = { environment: 'prod' };

/**
 * Reader of one logical account: records the call, fails for `failingAccount`, and
 * returns per-account statistics so their merge is observable.
 */
function accountReader(
  account: string,
  calls: QueryCall[],
  failingAccount?: string,
  rowsByAccount?: ReadonlyMap<string, Rows>,
  rowsForQuery?: RowsForQueryFn,
): ReturnType<typeof fakeReader> {
  return fakeReader({
    // eslint-disable-next-line @typescript-eslint/require-await
    async queryWithStatistics(
      groups: ReadonlyArray<string>,
      query: string,
      _timeRange: { start: Date; end: Date },
      options: { paginateResults?: boolean },
    ) {
      calls.push({
        account,
        groups,
        query,
        ...(options.paginateResults === undefined ? {} : { paginateResults: options.paginateResults }),
      });
      if (account === failingAccount) throw new Error('AccessDenied');
      const defaultRows: Rows = [
        [
          { field: '@timestamp', value: '2026-09-08T14:00:00.000Z' },
          { field: '@message', value: `${account} ERROR Invoke Error` },
        ],
      ];
      const rows = rowsForQuery?.(account, query) ?? rowsByAccount?.get(account) ?? defaultRows;
      const statistics = {
        bytesScanned: 1,
        recordsScanned: 1,
        recordsMatched: 1,
        ...(account === 'core'
          ? { logGroupsScanned: 2, estimatedBytesSkipped: 4 }
          : { logGroupsScanned: 3, estimatedRecordsSkipped: 6 }),
      };
      return {
        rows,
        statistics,
        queryExecutions: [{ queryId: account, profile: 'monitoring', logGroups: groups, statistics }],
      };
    },
  });
}

/** Context without an account port, for the trace and for a port built by the test. */
function errorlessContext(): OperationalContext {
  return {
    executionId: 'dual-account-test',
    startedAt: new Date('2026-09-08T14:00:00.000Z'),
    stepResults: new Map(),
    vars: new Map(),
    params: new Map([
      ['startTime', '2026-09-08T13:55:00.000Z'],
      ['endTime', '2026-09-08T14:05:00.000Z'],
    ]),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

function errorScan(): lambda.QueryLambdaAcrossAccountsStep {
  return new lambda.QueryLambdaAcrossAccountsStep({ ...LAMBDA_LOG_READER, queryKind: 'errors' });
}

function invocation(): lambda.QueryLambdaAcrossAccountsStep {
  return new lambda.QueryLambdaAcrossAccountsStep({ ...LAMBDA_LOG_READER, queryKind: 'invocation' });
}

/**
 * Context of a direct step execution: the account port over the synthetic SEND
 * directory, with the readers the pre-execution check would prepare.
 */
async function context(
  portOptions: PortOptions,
  calls: QueryCall[],
  failingAccount?: string,
  rowsByAccount?: ReadonlyMap<string, Rows>,
  rowsForQuery?: RowsForQueryFn,
): Promise<OperationalContext> {
  const awsAccounts = sendAccountsPort({
    ...portOptions,
    readers: Object.fromEntries(
      [SEND_ACCOUNTS.core, SEND_ACCOUNTS.confinfo].map((account) => [
        account,
        accountReader(awsLogicalAccountName(account), calls, failingAccount, rowsByAccount, rowsForQuery),
      ]),
    ),
  });
  await prepareSelections(awsAccounts, errorScan().accountSelections());
  return {
    executionId: 'dual-account-test',
    startedAt: new Date('2026-09-08T14:00:00.000Z'),
    stepResults: new Map([
      [
        'query-lambda-errors',
        [
          [
            { field: 'sourceAccount', value: 'core' },
            { field: '@requestId', value: CORE_REQUEST_ID },
          ],
          [
            { field: 'sourceAccount', value: 'confinfo' },
            { field: '@requestId', value: CORE_REQUEST_ID },
          ],
        ],
      ],
    ]),
    vars: new Map([['lambdaRequestId', CORE_REQUEST_ID]]),
    params: new Map([
      ['startTime', '2026-09-08T13:55:00.000Z'],
      ['endTime', '2026-09-08T14:05:00.000Z'],
    ]),
    logs: [],
    services: createTestServiceRegistry({ awsAccounts }),
    recoveredErrors: [],
  };
}

describe('pn-downstream-monitoring-lambda dual account query', () => {
  it('declares both SEND accounts of every environment, read independently', () => {
    assert.deepStrictEqual(errorScan().accountSelections(), [
      {
        subject: 'pn-downstream-monitoring-lambda',
        accounts: ['send/core', 'send/confinfo'],
        scope: 'every-account',
      },
    ]);
    assert.deepStrictEqual(errorScan().getTraceInfo(errorlessContext())['sources'], ['send/core', 'send/confinfo']);
  });

  it('reads core and confinfo with their own readers and retains each source', async () => {
    const calls: QueryCall[] = [];
    const result = await errorScan().execute(await context(PROD, calls));
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(
      calls.map(({ account }) => account),
      ['core', 'confinfo'],
    );
    assert.ok(
      calls.every(
        ({ groups, query, paginateResults }) =>
          groups[0] === '/aws/lambda/pn-downstream-monitoring-lambda' &&
          query.includes("@message like 'ERROR'") &&
          query.endsWith('| limit 1000') &&
          paginateResults === true,
      ),
    );
    assert.deepStrictEqual(
      result.output?.map((row) => row.find((field) => field.field === 'sourceAccount')?.value),
      ['core', 'confinfo'],
    );
    assert.deepStrictEqual(result.vars, {
      downstreamMonitoringAccountsChecked: 'core,confinfo',
      downstreamMonitoringCoreErrorLogCount: '1',
      downstreamMonitoringConfinfoErrorLogCount: '1',
    });
    assert.strictEqual(result.diagnostics?.cloudWatchLogs?.queryExecutions.length, 2);
    assert.deepStrictEqual(result.diagnostics?.cloudWatchLogs?.statistics, {
      bytesScanned: 2,
      recordsScanned: 2,
      recordsMatched: 2,
      logGroupsScanned: 5,
      estimatedBytesSkipped: 4,
      estimatedRecordsSkipped: 6,
    });
  });

  it('reads both accounts whichever of them raised the occurrence', async () => {
    for (const accountId of [SEND_ACCOUNT_IDS.coreProd, SEND_ACCOUNT_IDS.confinfoProd]) {
      const calls: QueryCall[] = [];
      const result = await errorScan().execute(await context(occurrenceIn(accountId), calls));
      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(
        calls.map(({ account }) => account),
        ['core', 'confinfo'],
      );
    }
  });

  it('reads both uat accounts for a uat occurrence and for a local uat execution', async () => {
    for (const portOptions of [occurrenceIn(SEND_ACCOUNT_IDS.confinfoUat), { environment: 'uat' }]) {
      const calls: QueryCall[] = [];
      const saturatedRows = Array.from({ length: 1000 }, () => [{ field: '@message', value: 'ERROR' }]);
      const result = await errorScan().execute(
        await context(portOptions, calls, undefined, undefined, (account) =>
          account === 'confinfo' ? saturatedRows : [],
        ),
      );
      // The saturation message names the resolved account: the uat one, not production.
      assert.strictEqual(result.success, false);
      assert.match(result.error ?? '', new RegExp(`confinfo \\(${SEND_ACCOUNT_IDS.confinfoUat}\\) reached`));
      assert.deepStrictEqual(
        calls.map(({ account }) => account),
        ['core', 'confinfo'],
      );
    }
  });

  it('rejects an occurrence outside the SEND accounts before querying', async () => {
    const awsAccounts = sendAccountsPort(occurrenceIn(SEND_ACCOUNT_IDS.unrelated));
    await assert.rejects(
      async () => prepareSelections(awsAccounts, errorScan().accountSelections()),
      rejectsWith('AWS_OCCURRENCE_ACCOUNT_MISMATCH'),
    );
    const result = await errorScan().execute({
      ...errorlessContext(),
      services: createTestServiceRegistry({ awsAccounts }),
    });
    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /not in the account directory/);
  });

  it('fails before querying when an account is unreachable', async () => {
    await assert.rejects(
      async () =>
        prepareSelections(
          sendAccountsPort({ ...PROD, unreachable: [SEND_ACCOUNTS.confinfo] }),
          errorScan().accountSelections(),
        ),
      rejectsWith('AWS_ACCOUNT_UNREACHABLE'),
    );
  });

  it('accepts an error scan just below the row limit', async () => {
    const calls: QueryCall[] = [];
    const rows = Array.from({ length: 999 }, (_, index) => [
      { field: '@timestamp', value: `2026-09-08T14:00:${String(index % 60).padStart(2, '0')}.000Z` },
      { field: '@message', value: `ERROR ${String(index)}` },
    ]);
    const input = await context(PROD, calls, undefined, undefined, (account) => (account === 'core' ? rows : []));

    const result = await errorScan().execute(input);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output?.length, 999);
    assert.strictEqual(calls.length, 2);
  });

  it('fails the error scan explicitly if either account reaches the row limit', async () => {
    const saturatedRows = Array.from({ length: 1000 }, () => [{ field: '@message', value: 'ERROR' }]);
    for (const [accountId, source, expectedQueries] of [
      [SEND_ACCOUNT_IDS.coreProd, 'core', 1],
      [SEND_ACCOUNT_IDS.confinfoProd, 'confinfo', 2],
    ] as const) {
      const calls: QueryCall[] = [];
      const input = await context(PROD, calls, undefined, undefined, (account) =>
        account === source ? saturatedRows : [],
      );

      const result = await errorScan().execute(input);

      assert.strictEqual(result.success, false);
      assert.match(result.error ?? '', new RegExp(`${source} \\(${accountId}\\) reached the 1000-row limit`));
      assert.match(result.error ?? '', /correlation requires a complete scan/);
      assert.strictEqual(result.output, undefined);
      assert.strictEqual(calls.length, expectedQueries);
    }
  });

  it('bounds invocation reconstruction in both accounts', async () => {
    const calls: QueryCall[] = [];
    const result = await invocation().execute(await context(PROD, calls));

    assert.strictEqual(result.success, true);
    assert.strictEqual(calls.length, 2);
    assert.ok(
      calls.every(
        ({ query, paginateResults }) =>
          query.includes("@requestId = 'b95bb742-cc30-4f07-80bc-45a38011e5c4'") &&
          query.endsWith('| limit 1000') &&
          paginateResults === true,
      ),
    );
  });

  it('batches every distinct request ID only in its source account', async () => {
    const calls: QueryCall[] = [];
    const input = await context(PROD, calls);
    (input.stepResults as Map<string, unknown>).set('query-lambda-errors', [
      [
        { field: 'sourceAccount', value: 'core' },
        { field: '@requestId', value: CORE_REQUEST_ID },
      ],
      [
        { field: 'sourceAccount', value: 'core' },
        { field: '@requestId', value: CORE_REQUEST_ID },
      ],
      [
        { field: 'sourceAccount', value: 'core' },
        { field: '@requestId', value: SECOND_CORE_REQUEST_ID },
      ],
      [
        { field: 'sourceAccount', value: 'confinfo' },
        { field: '@message', value: `ERROR RequestId: ${CONFINFO_REQUEST_ID}` },
      ],
    ]);

    const result = await invocation().execute(input);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(
      calls.map(({ account, query }) => ({
        account,
        coreRequestId: query.includes(CORE_REQUEST_ID),
        secondCoreRequestId: query.includes(SECOND_CORE_REQUEST_ID),
        confinfoRequestId: query.includes(CONFINFO_REQUEST_ID),
        bounded: query.endsWith('| limit 1000'),
      })),
      [
        {
          account: 'core',
          coreRequestId: true,
          secondCoreRequestId: true,
          confinfoRequestId: false,
          bounded: true,
        },
        {
          account: 'confinfo',
          coreRequestId: false,
          secondCoreRequestId: false,
          confinfoRequestId: true,
          bounded: true,
        },
      ],
    );
    assert.deepStrictEqual(
      result.output?.map((row) => row.find((field) => field.field === 'sourceAccount')?.value),
      ['core', 'confinfo'],
    );
    assert.strictEqual(result.diagnostics?.cloudWatchLogs?.queryExecutions.length, 2);
  });

  it('bounds a large set of request IDs to batches of 25', async () => {
    const calls: QueryCall[] = [];
    const input = await context(PROD, calls);
    const requestIds = Array.from({ length: 60 }, (_, index) => `req-${String(index)}`);
    (input.stepResults as Map<string, unknown>).set(
      'query-lambda-errors',
      requestIds.map((requestId) => [
        { field: 'sourceAccount', value: 'core' },
        { field: '@requestId', value: requestId },
      ]),
    );

    const result = await invocation().execute(input);

    assert.strictEqual(result.success, true);
    assert.strictEqual(calls.length, 3);
    assert.ok(calls.every(({ account }) => account === 'core'));
    for (const [index, call] of calls.entries()) {
      assert.ok(call !== undefined);
      const batch = requestIds.slice(index * 25, (index + 1) * 25);
      assert.strictEqual((call.query.match(/@requestId = '/g) ?? []).length, batch.length);
      assert.ok(batch.every((requestId) => call.query.includes(`@requestId = '${requestId}'`)));
    }
    assert.strictEqual(result.diagnostics?.cloudWatchLogs?.queryExecutions.length, 3);
  });

  it('splits a saturated batch so no request ID is silently dropped', async () => {
    const calls: QueryCall[] = [];
    const input = await context(PROD, calls, undefined, undefined, (_account, query) => {
      const row = [{ field: '@message', value: query }];
      return (query.match(/@requestId = '/g) ?? []).length > 1 ? Array.from({ length: 1000 }, () => row) : [row];
    });
    const requestIds = ['req-0', 'req-1', 'req-2', 'req-3'];
    (input.stepResults as Map<string, unknown>).set(
      'query-lambda-errors',
      requestIds.map((requestId) => [
        { field: 'sourceAccount', value: 'core' },
        { field: '@requestId', value: requestId },
      ]),
    );

    const result = await invocation().execute(input);

    assert.strictEqual(result.success, true);
    assert.strictEqual(calls.length, 7);
    assert.strictEqual(result.output?.length, 4);
    assert.strictEqual(result.diagnostics?.cloudWatchLogs?.queryExecutions.length, 7);
    assert.deepStrictEqual(
      result.output?.map((row) => row.find((field) => field.field === '@message')?.value),
      requestIds.map(
        (requestId) =>
          `fields @timestamp, @requestId, @message\n| filter (@requestId = '${requestId}' or @message like '${requestId}')\n| sort @timestamp asc\n| limit 1000`,
      ),
    );
  });

  it('fails explicitly when a single invocation still reaches the row limit', async () => {
    const calls: QueryCall[] = [];
    const saturatedRows = Array.from({ length: 1000 }, () => [{ field: '@message', value: 'many rows' }]);
    const input = await context(PROD, calls, undefined, undefined, () => saturatedRows);
    (input.stepResults as Map<string, unknown>).set('query-lambda-errors', [
      [
        { field: 'sourceAccount', value: 'core' },
        { field: '@requestId', value: CORE_REQUEST_ID },
      ],
    ]);

    const result = await invocation().execute(input);

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /reached the 1000-row limit/);
    assert.strictEqual(calls.length, 1);
  });

  it('fails explicitly when splitting would exceed the 100-query budget', async () => {
    const calls: QueryCall[] = [];
    const saturatedRow = [{ field: '@message', value: 'many rows' }];
    const saturatedRows = Array.from({ length: 1000 }, () => saturatedRow);
    const input = await context(PROD, calls, undefined, undefined, (_account, query) =>
      (query.match(/@requestId = '/g) ?? []).length > 1 ? saturatedRows : [saturatedRow],
    );
    (input.stepResults as Map<string, unknown>).set(
      'query-lambda-errors',
      Array.from({ length: 60 }, (_, index) => [
        { field: 'sourceAccount', value: 'core' },
        { field: '@requestId', value: `req-${String(index)}` },
      ]),
    );

    const result = await invocation().execute(input);

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /query budget exceeded \(100 queries\)/);
    assert.strictEqual(calls.length, 100);
  });

  it('skips an account without a request ID and reports zero when no IDs are available', async () => {
    const calls: QueryCall[] = [];
    const input = await context(PROD, calls);
    (input.stepResults as Map<string, unknown>).set('query-lambda-errors', [
      [
        { field: 'sourceAccount', value: 'confinfo' },
        { field: '@requestId', value: CONFINFO_REQUEST_ID },
      ],
    ]);

    const result = await invocation().execute(input);
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(
      calls.map(({ account }) => account),
      ['confinfo'],
    );
    assert.strictEqual(result.diagnostics?.cloudWatchLogs?.queryExecutions.length, 1);

    (input.stepResults as Map<string, unknown>).set('query-lambda-errors', [
      [
        { field: 'sourceAccount', value: 'core' },
        { field: '@message', value: 'ERROR without request ID' },
      ],
    ]);
    const noIds = await invocation().execute(input);
    assert.strictEqual(noIds.success, true);
    assert.deepStrictEqual(noIds.output, []);
    assert.strictEqual(noIds.vars?.['lambdaInvocationLogCount'], '0');
    assert.strictEqual(calls.length, 1);
  });

  it('fails if either account cannot be read', async () => {
    const calls: QueryCall[] = [];
    const input = await context(occurrenceIn(SEND_ACCOUNT_IDS.coreProd), calls, 'confinfo');
    const result = await errorScan().execute(input);
    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /AccessDenied/);
    assert.strictEqual(calls.length, 2);
  });

  it('recognizes SlowDown when only confinfo has an error row', async () => {
    const calls: QueryCall[] = [];
    const rowsByAccount = new Map<string, Rows>([
      ['core', []],
      [
        'confinfo',
        [
          [
            {
              field: '@message',
              value:
                'ERROR Invoke Error {"errorType":"SlowDown","errorMessage":"Please reduce your request rate.","$metadata":{"httpStatusCode":503}}',
            },
          ],
        ],
      ],
    ]);
    const input = await context(occurrenceIn(SEND_ACCOUNT_IDS.coreProd), calls, undefined, rowsByAccount);
    const result = await errorScan().execute(input);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output?.length, 1);
    const knownCase = KNOWN_CASES.find(({ id }) => id === 'downstream-monitoring-aws-slow-down');
    assert.ok(knownCase !== undefined);
    const evaluated = new ConditionEvaluator().evaluate(knownCase.condition, {
      ...input,
      stepResults: new Map([['query-lambda-errors', result.output]]),
    });
    assert.strictEqual(evaluated, true);
  });
});
