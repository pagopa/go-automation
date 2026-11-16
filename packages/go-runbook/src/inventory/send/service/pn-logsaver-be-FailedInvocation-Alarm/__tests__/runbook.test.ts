import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { GOLogger } from '@pagopa/go-common/logging';

import type { RunbookExecutionResult } from '../../../../../engine/index.js';
import {
  type AnalysisDraftV1,
  assertCloudExecutableRunbook,
  awsLogicalAccountName,
  buildAnalysisDraft,
  buildRunbookOutput,
  createTestServiceRegistry,
  SEND_ACCOUNTS,
} from '../../../../../toolkits/send/index.js';
import { rejectsWith } from '../../../../../toolkits/common/accounts/__tests__/fixtures.js';
import { OperationalRunbookEngine } from '../../../../../toolkits/common/engine/OperationalRunbookEngine.js';
import type { InMemoryAwsAccountsPortOptions } from '../../../../../toolkits/common/testing/InMemoryAwsAccountsPortOptions.js';
import {
  fakeReader,
  occurrenceIn,
  SEND_ACCOUNT_IDS,
  SEND_REGION,
  sendAccountsPort,
  SEND_TEST_ENVIRONMENT,
} from '../../../../../toolkits/send/accounts/__tests__/fixtures.js';
import { buildRunbook } from '../runbook.js';
import { ERROR_QUERY, LOG_GROUP } from '../QueryLogsaverDiagnosticsStep.js';

type Rows = ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;
/** Rows a logical account (`core`, `confinfo`) returns for a query. */
type ReadQueryRowsFn = (account: string, query: string) => Rows;
type PortOptions = Partial<InMemoryAwsAccountsPortOptions>;
interface QueryOptions {
  readonly failQuery?: string;
  readonly errorRecordsMatched?: number;
}
interface Call {
  readonly account: string;
  readonly query: string;
}

/** An occurrence in production SEND confinfo. */
const CONFINFO_OCCURRENCE: PortOptions = occurrenceIn(SEND_ACCOUNT_IDS.confinfoProd);
/** A local execution in production, without an occurrence: both accounts. */
const LOCAL_PROD: PortOptions = { environment: 'prod' };

/**
 * Runs the runbook through the operational engine, so the pre-execution account
 * check resolves and prepares the accounts before the first step.
 */
async function execute(
  portOptions: PortOptions,
  rows: Rows | ReadQueryRowsFn = [],
  queryOptions: QueryOptions = {},
): Promise<{ calls: Call[]; result: RunbookExecutionResult; draft: AnalysisDraftV1 | undefined }> {
  const calls: Call[] = [];
  const runbook = buildRunbook();
  const reader = (account: string): ReturnType<typeof fakeReader> =>
    fakeReader({
      // eslint-disable-next-line @typescript-eslint/require-await
      async queryWithStatistics(
        groups: ReadonlyArray<string>,
        query: string,
        _timeRange: unknown,
        options: { paginateResults?: boolean },
      ) {
        assert.deepStrictEqual(groups, [LOG_GROUP]);
        assert.strictEqual(options.paginateResults, true);
        calls.push({ account, query });
        if (query.includes(queryOptions.failQuery ?? 'NEVER_FAIL')) throw new Error('AccessDenied');
        const output = typeof rows === 'function' ? rows(account, query) : query === ERROR_QUERY ? rows : [];
        return {
          rows: output,
          statistics: {
            bytesScanned: 1,
            recordsScanned: output.length,
            recordsMatched: query === ERROR_QUERY ? (queryOptions.errorRecordsMatched ?? output.length) : output.length,
          },
          queryExecutions: [],
        };
      },
    });
  const awsAccounts = sendAccountsPort({
    ...portOptions,
    readers: Object.fromEntries(
      [SEND_ACCOUNTS.core, SEND_ACCOUNTS.confinfo].map((account) => [account, reader(awsLogicalAccountName(account))]),
    ),
  });
  const result = await new OperationalRunbookEngine(new GOLogger()).execute(
    runbook,
    new Map([
      ['startTime', '2026-09-10T09:06:01Z'],
      ['endTime', '2026-09-10T10:11:01Z'],
    ]),
    createTestServiceRegistry({ awsAccounts }),
    SEND_TEST_ENVIRONMENT,
  );
  return { calls, result, draft: buildAnalysisDraft(runbook, result) };
}

describe('logsaver Batch diagnostic runbook', () => {
  it('scopes cloud reads to the occurrence account and never closes an empty scan', async () => {
    const { calls, result, draft } = await execute(CONFINFO_OCCURRENCE);
    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(calls.length, 2);
    assert.ok(calls.every(({ account }) => account === 'confinfo'));
    assert.strictEqual(result.finalContext.vars.get('logsaverErrorLogCount'), '0');
    assert.strictEqual(result.finalContext.vars.get('logsaverAccountsChecked'), 'confinfo');
    assert.notStrictEqual(draft?.kind, 'KNOWN_CASE');
    assert.deepStrictEqual(buildRunbookOutput(buildRunbook(), result).context.details?.['awsAccounts'], [
      { account: 'send/confinfo', environment: 'prod', accountId: SEND_ACCOUNT_IDS.confinfoProd, region: SEND_REGION },
    ]);
  });

  it('retains equal messages from both accounts without deduplication or a recovery claim', async () => {
    const rows = [
      [
        { field: '@message', value: 'ERROR export failed' },
        { field: '@logStream', value: 'task-1' },
      ],
    ];
    const { result, calls, draft } = await execute(LOCAL_PROD, rows);
    assert.strictEqual(calls.length, 4);
    assert.deepStrictEqual(
      calls.map(({ account }) => account),
      ['core', 'core', 'confinfo', 'confinfo'],
    );
    const output = result.finalContext.stepResults.get('query-logsaver-diagnostics') as Rows;
    assert.strictEqual(output.length, 2);
    assert.deepStrictEqual(
      output.map((row) => row.find(({ field }) => field === 'sourceAccount')?.value),
      ['core', 'confinfo'],
    );
    assert.notStrictEqual(draft?.kind, 'KNOWN_CASE');
    const occurrenceOutput = buildRunbookOutput(buildRunbook(), result);
    assert.deepStrictEqual(occurrenceOutput.context.details?.['diagnostics'], {
      logsaverDiagnostics: 'COLLECTED',
      logsaverAccountsChecked: 'core,confinfo',
      logsaverErrorLogCount: 2,
      logsaverStreamCount: 0,
      logsaverSpotInterruptionLogCount: 0,
      logsaverUnaccountedErrorLogCount: 2,
    });
    assert.deepStrictEqual(
      occurrenceOutput.context.evidence[0]?.items?.map((item) => item['sourceAccountId']),
      [SEND_ACCOUNT_IDS.coreProd, SEND_ACCOUNT_IDS.confinfoProd],
    );
  });

  it('applies the documented no-action resolution only to the actual Spot signature', async () => {
    const { draft } = await execute(CONFINFO_OCCURRENCE, [
      [{ field: '@message', value: 'Your Spot Task was interrupted.' }],
    ]);
    assert.strictEqual(draft?.kind === 'KNOWN_CASE' ? draft.proposedStatus : undefined, 'COMPLETED');
    assert.strictEqual(draft?.kind === 'KNOWN_CASE' ? draft.conclusionNotes : undefined, 'Nessuna azione necessaria');
  });

  it('keeps the occurrence open when a Spot interruption accompanies an unrelated failure', async () => {
    const { draft } = await execute(CONFINFO_OCCURRENCE, [
      [
        { field: '@message', value: 'Your Spot Task was interrupted.' },
        { field: '@logStream', value: 'spot-task' },
      ],
      [
        { field: '@message', value: 'ERROR AccessDenied: cannot write archive' },
        { field: '@logStream', value: 'other-task' },
      ],
    ]);
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.doesNotMatch(draft.conclusionNotes, /Nessuna azione necessaria/u);
  });

  it('accounts for every error across accounts and streams before completing a Spot-only occurrence', async () => {
    const { result, draft } = await execute(LOCAL_PROD, [
      [
        { field: '@message', value: 'Your Spot Task was interrupted.' },
        { field: '@logStream', value: 'task-1' },
      ],
      [
        { field: 'message', value: 'Your Spot Task was interrupted.' },
        { field: '@logStream', value: 'task-2' },
      ],
    ]);
    assert.strictEqual(draft?.kind === 'KNOWN_CASE' ? draft.proposedStatus : undefined, 'COMPLETED');
    assert.strictEqual(result.finalContext.vars.get('logsaverSpotInterruptionLogCount'), '4');
    assert.strictEqual(result.finalContext.vars.get('logsaverUnaccountedErrorLogCount'), '0');
  });

  for (const sameStream of [false, true]) {
    it(`keeps an application exception open in ${sameStream ? 'the same' : 'another'} stream as the Spot event`, async () => {
      const { draft, result } = await execute(CONFINFO_OCCURRENCE, [
        [
          { field: '@message', value: 'Your Spot Task was interrupted.' },
          { field: '@logStream', value: 'spot-task' },
        ],
        [
          { field: '@message', value: 'RuntimeException: export failed' },
          { field: '@logStream', value: sameStream ? 'spot-task' : 'other-task' },
        ],
      ]);
      assert.strictEqual(draft?.kind === 'KNOWN_CASE' ? draft.proposedStatus : undefined, 'IN_PROGRESS');
      assert.strictEqual(result.finalContext.vars.get('logsaverUnaccountedErrorLogCount'), '1');
    });
  }

  it('keeps an error in the other account open even when the first account contains only Spot interruptions', async () => {
    const { draft, result } = await execute(LOCAL_PROD, (account, query) =>
      query === ERROR_QUERY
        ? [
            [
              {
                field: '@message',
                value:
                  account === 'core' ? 'Your Spot Task was interrupted.' : 'ERROR AccessDenied: cannot write archive',
              },
            ],
          ]
        : [],
    );
    assert.strictEqual(draft?.kind === 'KNOWN_CASE' ? draft.proposedStatus : undefined, 'IN_PROGRESS');
    assert.strictEqual(result.finalContext.vars.get('logsaverErrorLogCount'), '2');
    assert.strictEqual(result.finalContext.vars.get('logsaverUnaccountedErrorLogCount'), '1');
  });

  it('checks all error rows even when the output sample contains only later Spot messages', async () => {
    const { result } = await execute(
      CONFINFO_OCCURRENCE,
      [
        'ERROR AccessDenied: cannot write archive',
        ...Array.from({ length: 6 }, () => 'Your Spot Task was interrupted.'),
      ].map((message, index) => [
        { field: '@message', value: message },
        { field: '@timestamp', value: `2026-09-10T10:00:0${String(index)}Z` },
      ]),
    );
    const output = buildRunbookOutput(buildRunbook(), result);
    assert.strictEqual(
      output.analysis?.kind === 'KNOWN_CASE' ? output.analysis.proposedStatus : undefined,
      'IN_PROGRESS',
    );
    assert.strictEqual(output.context.evidence[0]?.items?.length, 5);
    assert.ok(output.context.evidence[0]?.items?.every(({ message }) => message === 'Your Spot Task was interrupted.'));
    assert.strictEqual(output.context.evidence[0]?.truncated, true);
    assert.strictEqual(result.finalContext.vars.get('logsaverUnaccountedErrorLogCount'), '1');
  });

  for (const row of [
    [{ field: '@message', value: 'Your Spot Task was interrupted. AccessDenied: upload failed' }],
    [
      { field: 'message', value: 'Your Spot Task was interrupted.' },
      {
        field: '@message',
        value: JSON.stringify({ message: 'Your Spot Task was interrupted.', exception: 'AccessDenied' }),
      },
    ],
    [{ field: '@logStream', value: 'unknown-error' }],
  ]) {
    it(`requires follow-up for compound or unclassified error evidence: ${JSON.stringify(row)}`, async () => {
      const { draft, result } = await execute(CONFINFO_OCCURRENCE, [
        [{ field: '@message', value: 'Your Spot Task was interrupted.' }],
        row,
      ]);
      assert.strictEqual(draft?.kind === 'KNOWN_CASE' ? draft.proposedStatus : undefined, 'IN_PROGRESS');
      assert.strictEqual(result.finalContext.vars.get('logsaverUnaccountedErrorLogCount'), '1');
    });
  }

  it('does not interpret stream metadata containing the Spot signature as an explained failure', async () => {
    const { draft, result } = await execute(CONFINFO_OCCURRENCE, (_account, query) =>
      query === ERROR_QUERY
        ? [
            [
              { field: '@message', value: 'ERROR AccessDenied' },
              { field: '@logStream', value: 'Your Spot Task was interrupted.' },
            ],
          ]
        : [
            [
              { field: '@logStream', value: 'Your Spot Task was interrupted.' },
              { field: 'logCount', value: '42' },
            ],
          ],
    );
    assert.notStrictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(result.finalContext.vars.get('logsaverSpotInterruptionLogCount'), '0');
    assert.strictEqual(result.finalContext.vars.get('logsaverUnaccountedErrorLogCount'), '1');
  });

  it('does not complete a Spot-only sample when query statistics report missing error rows', async () => {
    const { result, draft } = await execute(
      CONFINFO_OCCURRENCE,
      [[{ field: '@message', value: 'Your Spot Task was interrupted.' }]],
      { errorRecordsMatched: 2 },
    );
    assert.strictEqual(result.status, 'failed');
    assert.notStrictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(result.finalContext.vars.get('logsaverDiagnostics'), undefined);
    assert.strictEqual(result.finalContext.vars.get('logsaverUnaccountedErrorLogCount'), undefined);
  });

  it('rejects UAT, region mismatches, foreign occurrences and unreachable accounts before reading', async () => {
    for (const [portOptions, code] of [
      [occurrenceIn(SEND_ACCOUNT_IDS.confinfoUat), 'AWS_ACCOUNT_ENVIRONMENT_NOT_ALLOWED'],
      [{ environment: 'uat' }, 'AWS_ACCOUNT_ENVIRONMENT_NOT_ALLOWED'],
      [occurrenceIn(SEND_ACCOUNT_IDS.confinfoProd, 'eu-west-1'), 'AWS_OCCURRENCE_ACCOUNT_MISMATCH'],
      [occurrenceIn(SEND_ACCOUNT_IDS.unrelated), 'AWS_OCCURRENCE_ACCOUNT_MISMATCH'],
      [{}, 'AWS_ACCOUNT_ENVIRONMENT_NOT_CONFIGURED'],
      [{ ...LOCAL_PROD, unreachable: [SEND_ACCOUNTS.confinfo] }, 'AWS_ACCOUNT_UNREACHABLE'],
    ] as const) {
      const calls: Call[] = [];
      await assert.rejects(
        async () =>
          execute(portOptions, (account, query) => {
            calls.push({ account, query });
            return [];
          }),
        rejectsWith(code),
      );
      assert.deepStrictEqual(calls, []);
    }
  });

  it('needs no credentials for the account the occurrence excludes', async () => {
    const { calls, result } = await execute({ ...CONFINFO_OCCURRENCE, unreachable: [SEND_ACCOUNTS.core] });
    assert.strictEqual(result.status, 'completed');
    assert.ok(calls.every(({ account }) => account === 'confinfo'));
  });

  it('fails on query access errors and saturation instead of emitting a successful diagnostic draft', async () => {
    for (const failQuery of ['fields', 'stats']) {
      const { result, draft } = await execute(CONFINFO_OCCURRENCE, [], { failQuery });
      assert.strictEqual(result.status, 'failed');
      assert.notStrictEqual(draft?.kind, 'KNOWN_CASE');
    }
    const { result, draft } = await execute(
      CONFINFO_OCCURRENCE,
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
