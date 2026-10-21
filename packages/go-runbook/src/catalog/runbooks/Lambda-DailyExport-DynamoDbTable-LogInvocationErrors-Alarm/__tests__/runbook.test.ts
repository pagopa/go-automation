import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOLogger } from '@go-automation/go-common/core';
import type { ResultField } from '@go-automation/go-common/aws';

import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { buildRunbook } from '../runbook.js';

type Rows = ReadonlyArray<ReadonlyArray<ResultField>>;
const REQUEST_ID = 'fa3cf895-a2ae-46e6-9d44-d75bb2230d33';
const REPORT = `REPORT RequestId: ${REQUEST_ID}\tDuration: 3000.00 ms\tBilled Duration: 3434 ms\tMemory Size: 128 MB\tMax Memory Used: 96 MB\tStatus: timeout`;

function row(message: string): ReadonlyArray<ResultField> {
  return [
    { field: '@timestamp', value: '2026-10-20T01:00:43.912Z' },
    { field: '@requestId', value: REQUEST_ID },
    { field: '@message', value: message },
  ];
}

async function execute(
  errorRows: Rows,
  invocationRows: Rows,
): Promise<{
  result: RunbookExecutionResult;
  calls: { accountId: string; query: string }[];
}> {
  const calls: { accountId: string; query: string }[] = [];
  const cloudWatchLogs = {
    forTarget({ accountId }: { accountId: string }) {
      return {
        // eslint-disable-next-line @typescript-eslint/require-await
        async queryWithStatistics(_groups: ReadonlyArray<string>, query: string) {
          calls.push({ accountId, query });
          const rows =
            accountId === '510769970275' ? (query.includes("@message like 'ERROR'") ? errorRows : invocationRows) : [];
          return {
            rows,
            statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
            queryExecutions: [],
          };
        },
      };
    },
  };
  const result = await new RunbookEngine(new GOLogger()).execute(
    buildRunbook(),
    new Map([
      ['awsProfiles', 'sso_pn-core-prod_readonly,sso_pn-confinfo-prod'],
      ['awsAccountId', '350578575906'],
      ['awsRegion', 'eu-south-1'],
      ['startTime', '2026-10-20T00:56:00.000Z'],
      ['endTime', '2026-10-20T01:06:00.000Z'],
    ]),
    createTestServiceRegistry({ cloudWatchLogs }),
  );
  return { result, calls };
}

describe('DailyExport DynamoDB runbook', () => {
  it('builds a read-only Lambda runbook with the correct operational reference', () => {
    const runbook = buildRunbook();
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.deepStrictEqual(runbook.analysisDefaults?.resources, [
      { name: 'Lambda-DailyExport-DynamoDbTable', role: 'PRIMARY' },
    ]);
    assert.match(runbook.analysisDefaults?.links?.[0]?.url ?? '', /3411443959/);
  });

  it('finds a timeout REPORT in core for an occurrence attributed to confinfo', async () => {
    const { result, calls } = await execute([row(REPORT)], [row(REPORT)]);
    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(result.finalContext.vars.get('lambdaErrorCategory'), 'timeout');
    assert.deepStrictEqual(
      result.matchedCases.map(({ id }) => id),
      ['daily-export-timeout'],
    );
    assert.deepStrictEqual(
      calls.map(({ accountId }) => accountId),
      ['510769970275', '350578575906', '510769970275'],
    );
    assert.ok(calls.slice(0, 2).every(({ query }) => query.includes('Status:\\s*timeout')));
    assert.ok(calls[2]?.query.includes(REQUEST_ID));
    assert.strictEqual(result.matchedCases[0]?.analysis?.proposedStatus, 'IN_PROGRESS');
    assert.strictEqual(result.matchedCases[0]?.analysis?.resolution, 'Risoluzione non documentata.');
    assert.deepStrictEqual(result.matchedCases[0]?.analysis?.finalActions ?? [], []);
  });

  it('does not turn a retry and a later REPORT into automatic closure', async () => {
    const { result } = await execute(
      [row(REPORT)],
      [
        row(REPORT),
        row(`START RequestId: ${REQUEST_ID} Version: $LATEST`),
        row(`REPORT RequestId: ${REQUEST_ID}\tDuration: 1974.69 ms\tMemory Size: 128 MB\tMax Memory Used: 96 MB`),
        row(`END RequestId: ${REQUEST_ID}`),
      ],
    );
    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(result.matchedCases[0]?.analysis?.proposedStatus, 'IN_PROGRESS');
    assert.doesNotMatch(result.matchedCases[0]?.analysis?.resolution ?? '', /recuper|retry|chius/i);
  });

  it('does not invent cases for generic application errors or missing logs', async () => {
    for (const errors of [
      [],
      [row('ERROR unknown application failure')],
      [row('ERROR downstream connection timed out')],
    ]) {
      const { result } = await execute(errors, []);
      assert.strictEqual(result.status, 'completed');
      assert.deepStrictEqual(result.matchedCases, []);
    }
  });
});
