import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ResultField } from '@go-automation/go-common/aws';
import type { TreeNode } from '@go-automation/go-common/core';

import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import type { RunbookContext } from '../../framework.js';
import { ERROR_QUERY, LOG_GROUP, QueryLogsaverDiagnosticsStep } from '../QueryLogsaverDiagnosticsStep.js';

type Rows = ReadonlyArray<ReadonlyArray<ResultField>>;
type RowsForQueryFn = (accountId: string, queryKind: 'errors' | 'streams') => Rows;

const CORE_ACCOUNT = '510769970275';
const CONFINFO_ACCOUNT = '350578575906';
const BOTH_PROFILES = 'sso_pn-core-prod_readonly,sso_pn-confinfo-prod';

function rows(count: number, field: string): Rows {
  return Array.from({ length: count }, (_, index) => [{ field, value: `${field}-${String(index)}` }]);
}

function queryKind(query: string): 'errors' | 'streams' {
  return query === ERROR_QUERY ? 'errors' : 'streams';
}

function context(
  rowsForQuery: RowsForQueryFn,
  labels: string[],
  accountsWithoutStatistics: ReadonlySet<string> = new Set(),
): RunbookContext {
  return {
    executionId: 'logsaver-diagnostics-test',
    startedAt: new Date('2026-09-10T10:11:01.000Z'),
    stepResults: new Map(),
    vars: new Map(),
    params: new Map([
      ['startTime', '2026-09-10T09:06:01Z'],
      ['endTime', '2026-09-10T10:11:01Z'],
      ['awsProfiles', BOTH_PROFILES],
    ]),
    logs: [],
    services: createTestServiceRegistry({
      reporter: {
        section(): void {},
        add(...nodes: ReadonlyArray<TreeNode>): void {
          labels.push(...nodes.map(({ label }) => label));
        },
        flush(): void {},
      },
      cloudWatchLogs: {
        forTarget(target: { accountId: string }) {
          if (accountsWithoutStatistics.has(target.accountId)) {
            return {
              // eslint-disable-next-line @typescript-eslint/require-await
              async query(_groups: ReadonlyArray<string>, query: string) {
                return rowsForQuery(target.accountId, queryKind(query));
              },
            };
          }
          return {
            // eslint-disable-next-line @typescript-eslint/require-await
            async queryWithStatistics(_groups: ReadonlyArray<string>, query: string) {
              const output = rowsForQuery(target.accountId, queryKind(query));
              const statistics = { bytesScanned: 10, recordsScanned: 5, recordsMatched: output.length };
              return {
                rows: output,
                statistics,
                queryExecutions: [{ queryId: `${target.accountId}-${queryKind(query)}`, statistics }],
              };
            },
          };
        },
      },
    }),
    recoveredErrors: [],
  };
}

describe('QueryLogsaverDiagnosticsStep', () => {
  it('tags each row with its source and query kind and sums diagnostics across all queries', async () => {
    const labels: string[] = [];
    const result = await new QueryLogsaverDiagnosticsStep().execute(
      context((_accountId, kind) => (kind === 'errors' ? rows(1, '@message') : rows(2, '@logStream')), labels),
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
      [
        `${CORE_ACCOUNT}-errors`,
        `${CORE_ACCOUNT}-streams`,
        `${CONFINFO_ACCOUNT}-errors`,
        `${CONFINFO_ACCOUNT}-streams`,
      ],
    );
    assert.ok(labels.includes('Logsaver: 2 log di errore, 4 stream.'));
  });

  it('omits aggregated diagnostics when any target cannot report query statistics', async () => {
    const result = await new QueryLogsaverDiagnosticsStep().execute(
      context(() => rows(1, '@message'), [], new Set([CONFINFO_ACCOUNT])),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output?.length, 4);
    assert.strictEqual(result.diagnostics, undefined);
  });

  it('names the saturated query kind and source account', async () => {
    const result = await new QueryLogsaverDiagnosticsStep().execute(
      context(
        (accountId, kind) => (accountId === CONFINFO_ACCOUNT && kind === 'streams' ? rows(1000, '@logStream') : []),
        [],
      ),
    );

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /Logsaver streams in confinfo reached 1000 rows/);
  });

  it('traces the log group and both diagnostic queries', () => {
    const trace = new QueryLogsaverDiagnosticsStep().getTraceInfo();

    assert.strictEqual(trace['logGroup'], LOG_GROUP);
    assert.strictEqual(trace['errorQuery'], ERROR_QUERY);
    assert.match(String(trace['streamQuery']), /by @logStream/);
    assert.strictEqual(trace['batchVerification'], undefined);
  });
});
