import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOLogger } from '@go-automation/go-common/core';
import type { ResultField } from '@go-automation/go-common/aws';

import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import type { AnalysisDraftV1 } from '../../../../output/AnalysisDraft.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { buildRunbook } from '../runbook.js';
import { ERROR_QUERY, LOG_GROUP } from '../QueryLogsaverDiagnosticsStep.js';

type Rows = ReadonlyArray<ReadonlyArray<ResultField>>;
interface Call {
  readonly accountId: string;
  readonly profile?: string;
  readonly query: string;
}

async function execute(
  params: ReadonlyArray<readonly [string, string]>,
  rows: Rows = [],
  failQuery?: string,
): Promise<{ calls: Call[]; result: RunbookExecutionResult; draft: AnalysisDraftV1 | undefined }> {
  const calls: Call[] = [];
  const runbook = buildRunbook();
  const result = await new RunbookEngine(new GOLogger()).execute(
    runbook,
    new Map([['startTime', '2026-09-10T09:06:01Z'], ['endTime', '2026-09-10T10:11:01Z'], ...params]),
    createTestServiceRegistry({
      cloudWatchLogs: {
        forTarget(target: { accountId: string; region: string; profile?: string }) {
          return {
            // eslint-disable-next-line @typescript-eslint/require-await
            async queryWithStatistics(
              groups: ReadonlyArray<string>,
              query: string,
              _timeRange: unknown,
              options: { paginateResults?: boolean },
            ) {
              assert.deepStrictEqual(groups, [LOG_GROUP]);
              assert.strictEqual(options.paginateResults, true);
              calls.push({ ...target, query });
              if (query.includes(failQuery ?? 'NEVER_FAIL')) throw new Error('AccessDenied');
              const output = query === ERROR_QUERY ? rows : [];
              return {
                rows: output,
                statistics: { bytesScanned: 1, recordsScanned: output.length, recordsMatched: output.length },
                queryExecutions: [],
              };
            },
          };
        },
      },
    }),
  );
  return { calls, result, draft: buildAnalysisDraft(runbook, result) };
}

describe('logsaver Batch diagnostic runbook', () => {
  it('scopes cloud reads to the occurrence account and never closes an empty scan', async () => {
    const { calls, result, draft } = await execute([['awsAccountId', '350578575906']]);
    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(calls.length, 2);
    assert.ok(calls.every(({ accountId, profile }) => accountId === '350578575906' && profile === undefined));
    assert.strictEqual(result.finalContext.vars.get('logsaverErrorLogCount'), '0');
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.match(draft.conclusionNotes, /Status reason/);
    assert.match(draft.conclusionNotes, /stessi dati e intervalli/);
    assert.deepStrictEqual(draft.finalActions, []);
  });

  it('retains equal messages from both accounts without deduplication or a recovery claim', async () => {
    const rows = [
      [
        { field: '@message', value: 'ERROR export failed' },
        { field: '@logStream', value: 'task-1' },
      ],
    ];
    const { result, calls, draft } = await execute(
      [['awsProfiles', 'sso_pn-core-prod_readonly,sso_pn-confinfo-prod']],
      rows,
    );
    assert.strictEqual(calls.length, 4);
    assert.deepStrictEqual(
      calls.map(({ profile }) => profile),
      ['sso_pn-core-prod_readonly', 'sso_pn-core-prod_readonly', 'sso_pn-confinfo-prod', 'sso_pn-confinfo-prod'],
    );
    const output = result.finalContext.stepResults.get('query-logsaver-diagnostics') as Rows;
    assert.strictEqual(output.length, 2);
    assert.deepStrictEqual(
      output.map((row) => row.find(({ field }) => field === 'sourceAccount')?.value),
      ['core', 'confinfo'],
    );
    assert.strictEqual(draft?.kind === 'KNOWN_CASE' ? draft.proposedStatus : undefined, 'IN_PROGRESS');
  });

  it('keeps a Spot signature open until Batch status and recovery have been checked', async () => {
    const { draft } = await execute(
      [['awsAccountId', '350578575906']],
      [[{ field: '@message', value: 'Your Spot Task was interrupted.' }]],
    );
    assert.strictEqual(draft?.kind === 'KNOWN_CASE' ? draft.proposedStatus : undefined, 'IN_PROGRESS');
  });

  it('rejects UAT, unsupported regions and incomplete local account selection before reading', async () => {
    for (const params of [
      [['awsAccountId', '956319218727']],
      [
        ['awsAccountId', '350578575906'],
        ['awsRegion', 'eu-west-1'],
      ],
      [['awsProfiles', 'sso_pn-core-prod_readonly']],
      [],
    ] as const) {
      const { calls, result } = await execute(params);
      assert.strictEqual(result.status, 'failed');
      assert.deepStrictEqual(calls, []);
    }
  });

  it('fails on query access errors and saturation instead of emitting a successful diagnostic draft', async () => {
    for (const failQuery of ['fields', 'stats']) {
      const { result, draft } = await execute([['awsAccountId', '350578575906']], [], failQuery);
      assert.strictEqual(result.status, 'failed');
      assert.notStrictEqual(draft?.kind, 'KNOWN_CASE');
    }
    const { result, draft } = await execute(
      [['awsAccountId', '350578575906']],
      Array.from({ length: 1000 }, () => [{ field: '@message', value: 'ERROR' }]),
    );
    assert.strictEqual(result.status, 'failed');
    assert.notStrictEqual(draft?.kind, 'KNOWN_CASE');
  });

  it('excludes the harmless JVM option from error signatures and remains cloud read-only', () => {
    const signature = /\b(error|fatal|outofmemoryerror)\b/i;
    assert.strictEqual(signature.test('Picked up JAVA_TOOL_OPTIONS: -XX:+ExitOnOutOfMemoryError'), false);
    assert.strictEqual(signature.test('java.lang.OutOfMemoryError: Java heap space'), true);
    assert.ok(ERROR_QUERY.includes('\\b(error|fatal|outofmemoryerror)\\b'));
    const runbook = buildRunbook();
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 60, afterMinutes: 5 });
  });
});
