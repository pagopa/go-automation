import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import type { TreeNode } from '@pagopa/go-common/render';

import { awsLogicalAccountName, createTestServiceRegistry, SEND_ACCOUNTS } from '../../../../../toolkits/send/index.js';
import { ERROR_QUERY, LOG_GROUP, QueryLogsaverDiagnosticsStep } from '../QueryLogsaverDiagnosticsStep.js';
import type { OperationalContext } from '../../../../../toolkits/common/services/OperationalContext.js';
import { rejectsWith } from '../../../../../toolkits/common/accounts/__tests__/fixtures.js';
import type { InMemoryAwsAccountsPortOptions } from '../../../../../toolkits/common/testing/InMemoryAwsAccountsPortOptions.js';
import {
  fakeReader,
  occurrenceIn,
  prepareSelections,
  SEND_ACCOUNT_IDS,
  sendAccountsPort,
} from '../../../../../toolkits/send/accounts/__tests__/fixtures.js';

type Rows = ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;
type RowsForQueryFn = (account: string, queryKind: 'errors' | 'streams') => Rows;

const CORE_ACCOUNT = SEND_ACCOUNT_IDS.coreProd;
const CONFINFO_ACCOUNT = SEND_ACCOUNT_IDS.confinfoProd;
/** Local execution in production, without an occurrence: both accounts. */
const PROD: Partial<InMemoryAwsAccountsPortOptions> = { environment: 'prod' };

function rows(count: number, field: string): Rows {
  return Array.from({ length: count }, (_, index) => [{ field, value: `${field}-${String(index)}` }]);
}

function queryKind(query: string): 'errors' | 'streams' {
  return query === ERROR_QUERY ? 'errors' : 'streams';
}

/** Reader of one logical account (`core`, `confinfo`), with or without query statistics. */
function accountReader(
  account: string,
  rowsForQuery: RowsForQueryFn,
  withStatistics: boolean,
): ReturnType<typeof fakeReader> {
  if (!withStatistics) {
    return fakeReader({
      // eslint-disable-next-line @typescript-eslint/require-await
      async query(_groups: ReadonlyArray<string>, query: string) {
        return rowsForQuery(account, queryKind(query));
      },
    });
  }
  return fakeReader({
    // eslint-disable-next-line @typescript-eslint/require-await
    async queryWithStatistics(_groups: ReadonlyArray<string>, query: string) {
      const output = rowsForQuery(account, queryKind(query));
      const statistics = { bytesScanned: 10, recordsScanned: 5, recordsMatched: output.length };
      return {
        rows: output,
        statistics,
        queryExecutions: [{ queryId: `${account}-${queryKind(query)}`, statistics }],
      };
    },
  });
}

/**
 * Context of a direct step execution, with the readers the pre-execution check would prepare.
 * Accounts listed in `accountsWithoutStatistics` (by name) report no query statistics.
 */
async function context(
  rowsForQuery: RowsForQueryFn,
  labels: string[],
  accountsWithoutStatistics: ReadonlySet<string> = new Set(),
  portOptions: Partial<InMemoryAwsAccountsPortOptions> = PROD,
): Promise<OperationalContext> {
  const awsAccounts = sendAccountsPort({
    ...portOptions,
    readers: Object.fromEntries(
      [SEND_ACCOUNTS.core, SEND_ACCOUNTS.confinfo].map((account) => {
        const name = awsLogicalAccountName(account);
        return [account, accountReader(name, rowsForQuery, !accountsWithoutStatistics.has(name))];
      }),
    ),
  });
  await prepareSelections(awsAccounts, new QueryLogsaverDiagnosticsStep().accountSelections());
  return {
    executionId: 'logsaver-diagnostics-test',
    startedAt: new Date('2026-09-10T10:11:01.000Z'),
    stepResults: new Map(),
    vars: new Map(),
    params: new Map([
      ['startTime', '2026-09-10T09:06:01Z'],
      ['endTime', '2026-09-10T10:11:01Z'],
    ]),
    logs: [],
    services: createTestServiceRegistry({
      awsAccounts,
      reporter: {
        section(): void {},
        add(...nodes: ReadonlyArray<TreeNode>): void {
          labels.push(...nodes.map(({ label }) => label));
        },
        flush(): void {},
      },
    }),
    recoveredErrors: [],
  };
}

describe('QueryLogsaverDiagnosticsStep', () => {
  it('tags each row with its source and query kind and sums diagnostics across all queries', async () => {
    const labels: string[] = [];
    const result = await new QueryLogsaverDiagnosticsStep().execute(
      await context((_account, kind) => (kind === 'errors' ? rows(1, '@message') : rows(2, '@logStream')), labels),
    );

    assert.strictEqual(result.success, true);
    const output = result.output ?? [];
    assert.strictEqual(output.length, 6);
    const tags = output.map((row) =>
      ['sourceAccount', 'sourceAccountId', 'queryKind'].map((field) => row.find((cell) => cell.field === field)?.value),
    );
    assert.deepStrictEqual(tags, [
      ['core', CORE_ACCOUNT, 'errors'],
      ['core', CORE_ACCOUNT, 'streams'],
      ['core', CORE_ACCOUNT, 'streams'],
      ['confinfo', CONFINFO_ACCOUNT, 'errors'],
      ['confinfo', CONFINFO_ACCOUNT, 'streams'],
      ['confinfo', CONFINFO_ACCOUNT, 'streams'],
    ]);
    assert.deepStrictEqual(result.vars, {
      logsaverDiagnostics: 'COLLECTED',
      logsaverAccountsChecked: 'core,confinfo',
      logsaverErrorLogCount: '2',
      logsaverStreamCount: '4',
      logsaverSpotInterruptionLogCount: '0',
      logsaverUnaccountedErrorLogCount: '2',
    });
    const diagnostics = result.diagnostics?.cloudWatchLogs;
    assert.strictEqual(diagnostics?.rowsReturned, 6);
    assert.deepStrictEqual(diagnostics.statistics, { bytesScanned: 40, recordsScanned: 20, recordsMatched: 6 });
    assert.deepStrictEqual(
      diagnostics.queryExecutions.map(({ queryId }) => queryId),
      ['core-errors', 'core-streams', 'confinfo-errors', 'confinfo-streams'],
    );
    assert.ok(labels.includes('Logsaver: 2 log di errore, 4 stream.'));
  });

  it('omits aggregated diagnostics when any target cannot report query statistics', async () => {
    const result = await new QueryLogsaverDiagnosticsStep().execute(
      await context(() => rows(1, '@message'), [], new Set(['confinfo'])),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output?.length, 4);
    assert.strictEqual(result.diagnostics, undefined);
  });

  it('names the saturated query kind and source account', async () => {
    const result = await new QueryLogsaverDiagnosticsStep().execute(
      await context(
        (account, kind) => (account === 'confinfo' && kind === 'streams' ? rows(1000, '@logStream') : []),
        [],
      ),
    );

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /Logsaver streams in confinfo reached 1000 rows/);
  });

  it('declares both production SEND accounts, narrowed to the occurrence account', () => {
    assert.deepStrictEqual(new QueryLogsaverDiagnosticsStep().accountSelections(), [
      {
        subject: 'logsaver',
        accounts: ['send/core', 'send/confinfo'],
        scope: 'occurrence-account',
        environments: ['prod'],
      },
    ]);
  });

  it('reads only the occurrence account when there is an occurrence', async () => {
    const read: string[] = [];
    const result = await new QueryLogsaverDiagnosticsStep().execute(
      await context(
        (account, kind) => {
          read.push(`${account}-${kind}`);
          return kind === 'errors' ? rows(1, '@message') : [];
        },
        [],
        new Set(),
        occurrenceIn(CONFINFO_ACCOUNT),
      ),
    );

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(read, ['confinfo-errors', 'confinfo-streams']);
    assert.strictEqual(result.vars?.['logsaverAccountsChecked'], 'confinfo');
    assert.deepStrictEqual(
      result.output?.map((row) => row.find(({ field }) => field === 'sourceAccountId')?.value),
      [CONFINFO_ACCOUNT],
    );
  });

  it('rejects a uat occurrence and a region mismatch without reading', async () => {
    for (const [occurrence, code, error] of [
      [
        occurrenceIn(SEND_ACCOUNT_IDS.confinfoUat),
        'AWS_ACCOUNT_ENVIRONMENT_NOT_ALLOWED',
        /only environments prod, not uat/,
      ],
      [occurrenceIn(CONFINFO_ACCOUNT, 'eu-west-1'), 'AWS_OCCURRENCE_ACCOUNT_MISMATCH', /in region eu-west-1/],
    ] as const) {
      const read: string[] = [];
      const recordingReader = (account: string): ReturnType<typeof fakeReader> =>
        accountReader(
          account,
          (name, kind) => {
            read.push(`${name}-${kind}`);
            return [];
          },
          true,
        );
      const awsAccounts = sendAccountsPort({
        ...occurrence,
        readers: {
          [SEND_ACCOUNTS.core]: recordingReader('core'),
          [SEND_ACCOUNTS.confinfo]: recordingReader('confinfo'),
        },
      });
      const step = new QueryLogsaverDiagnosticsStep();
      await assert.rejects(async () => prepareSelections(awsAccounts, step.accountSelections()), rejectsWith(code));
      // The step itself fails the same way if run past the pre-execution check.
      const ctx = await context(() => [], []);
      const result = await step.execute({ ...ctx, services: { ...ctx.services, awsAccounts } });
      assert.strictEqual(result.success, false);
      assert.match(result.error ?? '', error);
      assert.deepStrictEqual(read, []);
    }
  });

  it('traces the log group and both diagnostic queries', () => {
    const trace = new QueryLogsaverDiagnosticsStep().getTraceInfo();

    assert.strictEqual(trace['logGroup'], LOG_GROUP);
    assert.strictEqual(trace['errorQuery'], ERROR_QUERY);
    assert.match(String(trace['streamQuery']), /by @logStream/);
    assert.strictEqual(trace['batchVerification'], undefined);
  });
});
