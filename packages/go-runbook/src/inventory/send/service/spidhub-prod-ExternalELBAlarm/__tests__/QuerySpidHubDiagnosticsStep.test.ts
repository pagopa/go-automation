import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { createTestServiceRegistry, SEND_ACCOUNTS } from '../../../../../toolkits/send/index.js';
import { QuerySpidHubDiagnosticsStep } from '../QuerySpidHubDiagnosticsStep.js';
import { ERROR_QUERY, SPIDHUB_ACCOUNTS, SPIDHUB_LOG_GROUP, STREAM_QUERY } from '../alarmDefinition.js';
import { rejectsWith } from '../../../../../toolkits/common/accounts/__tests__/fixtures.js';
import type { OperationalContext } from '../../../../../toolkits/common/services/OperationalContext.js';
import type { InMemoryAwsAccountsPortOptions } from '../../../../../toolkits/common/testing/InMemoryAwsAccountsPortOptions.js';
import {
  fakeReader,
  occurrenceIn,
  prepareSelections,
  SEND_ACCOUNT_IDS,
  sendAccountsPort,
} from '../../../../../toolkits/send/accounts/__tests__/fixtures.js';

type Rows = ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;
type ReadQueryFn = (query: string) => Rows;
type PortOptions = Partial<InMemoryAwsAccountsPortOptions>;
const RESPONDER =
  '[io-spid-commons] error: Spid Authentication|Authentication Error|ERROR=Error: Value attribute of StatusCode is invalid: urn:oasis:names:tc:SAML:2.0:status:Responder';
/** The SPID Hub account: SEND confinfo in production. */
const SPIDHUB_ACCOUNT_ID = SEND_ACCOUNT_IDS.confinfoProd;

/**
 * Context of a direct step execution. Only the confinfo reader exists: reading
 * another account would fail. With `prepare`, the readers are prepared as the
 * pre-execution check would; without it, the test exercises a rejected selection.
 */
async function context(
  read: ReadQueryFn,
  signal?: AbortSignal,
  portOptions: PortOptions = occurrenceIn(SPIDHUB_ACCOUNT_ID),
  prepare = true,
): Promise<OperationalContext> {
  const awsAccounts = sendAccountsPort({
    ...portOptions,
    readers: {
      [SEND_ACCOUNTS.confinfo]: fakeReader({
        // eslint-disable-next-line @typescript-eslint/require-await
        async queryWithStatistics(
          groups: ReadonlyArray<string>,
          query: string,
          _timeRange: unknown,
          options: { signal?: AbortSignal; paginateResults?: boolean },
        ) {
          assert.deepStrictEqual(groups, [SPIDHUB_LOG_GROUP]);
          assert.strictEqual(options.signal, signal);
          assert.strictEqual(options.paginateResults, true);
          const rows = read(query);
          const statistics = { bytesScanned: 10, recordsScanned: 20, recordsMatched: rows.length };
          return {
            rows,
            statistics,
            queryExecutions: [{ queryId: query === ERROR_QUERY ? 'errors' : 'streams', statistics }],
          };
        },
      }),
    },
  });
  if (prepare) await prepareSelections(awsAccounts, [SPIDHUB_ACCOUNTS]);
  return {
    executionId: 'spidhub-test',
    startedAt: new Date('2026-09-18T08:52:13Z'),
    stepResults: new Map(),
    vars: new Map(),
    params: new Map([
      ['startTime', '2026-09-18T08:47:13Z'],
      ['endTime', '2026-09-18T08:57:13Z'],
    ]),
    logs: [],
    services: createTestServiceRegistry({ awsAccounts }),
    recoveredErrors: [],
    ...(signal === undefined ? {} : { signal }),
  };
}

describe('QuerySpidHubDiagnosticsStep', () => {
  it('collects both queries before matching and retains duplicate application evidence', async () => {
    const messages = [RESPONDER, RESPONDER, 'Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent'];
    const ctx = await context((query) =>
      query === ERROR_QUERY
        ? messages.map((value) => [{ field: '@message', value }])
        : [[{ field: '@logStream', value: 'task-1' }]],
    );
    const result = await new QuerySpidHubDiagnosticsStep().execute(ctx);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output?.length, 4);
    assert.deepStrictEqual(result.vars, {
      spidHubDiagnostics: 'COLLECTED',
      spidHubAccountId: SPIDHUB_ACCOUNT_ID,
      spidHubErrorLogCount: '3',
      spidHubStreamCount: '1',
      spidHubResponderCount: '2',
      spidHubHeadersSentCount: '1',
    });
    assert.deepStrictEqual(
      result.output?.map((row) => row.find((field) => field.field === 'queryKind')?.value),
      ['errors', 'errors', 'errors', 'streams'],
    );
    assert.ok(
      result.output?.every((row) =>
        row.some((field) => field.field === 'sourceAccountId' && field.value === SPIDHUB_ACCOUNT_ID),
      ),
    );
    assert.deepStrictEqual(result.diagnostics?.cloudWatchLogs?.statistics, {
      bytesScanned: 20,
      recordsScanned: 40,
      recordsMatched: 4,
    });
  });

  it('requires the full SAML signature in one raw message and ignores misleading summary values', async () => {
    const result = await new QuerySpidHubDiagnosticsStep().execute(
      await context((query) =>
        query === ERROR_QUERY
          ? [
              [{ field: '@message', value: RESPONDER.replace('[io-spid-commons]', '[other-component]') }],
              [{ field: '@message', value: RESPONDER.replace('status:Responder', 'status:Requester') }],
              [{ field: '@message', value: 'ERR_HTTP_HEADERS_SENT_OTHER' }],
              [{ field: '@message', value: 'Spid Authentication|Authentication Error' }],
              [{ field: '@message', value: 'status:Responder' }],
            ]
          : [[{ field: '@logStream', value: `${RESPONDER} ERR_HTTP_HEADERS_SENT` }]],
      ),
    );
    assert.strictEqual(result.vars?.['spidHubResponderCount'], '0');
    assert.strictEqual(result.vars?.['spidHubHeadersSentCount'], '0');
  });

  it('collects empty logs without claiming recovery', async () => {
    const result = await new QuerySpidHubDiagnosticsStep().execute(await context(() => []));
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars?.['spidHubDiagnostics'], 'COLLECTED');
    assert.strictEqual(result.vars?.['spidHubErrorLogCount'], '0');
    assert.strictEqual(result.next, undefined);
  });

  it('forwards the caller cancellation signal to both AWS queries', async () => {
    const controller = new AbortController();
    const result = await new QuerySpidHubDiagnosticsStep().execute(await context(() => [], controller.signal));
    assert.strictEqual(result.success, true);
  });

  for (const saturatedQuery of [ERROR_QUERY, STREAM_QUERY]) {
    it(`fails on a saturated ${saturatedQuery === ERROR_QUERY ? 'error scan' : 'stream inventory'}`, async () => {
      const result = await new QuerySpidHubDiagnosticsStep().execute(
        await context((query) => (query === saturatedQuery ? Array.from({ length: 1000 }, () => []) : [])),
      );
      assert.strictEqual(result.success, false);
      assert.match(result.error ?? '', /reached 1000 rows/u);
      assert.strictEqual(result.vars, undefined);
    });
  }

  it('fails on access errors without publishing partial diagnostics', async () => {
    const result = await new QuerySpidHubDiagnosticsStep().execute(
      await context((query) => {
        if (query === STREAM_QUERY) throw new Error('AccessDenied');
        return [[{ field: '@message', value: RESPONDER }]];
      }),
    );
    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /AccessDenied/u);
    assert.strictEqual(result.vars, undefined);
  });

  it('resolves the SPID Hub account from the directory, with or without an occurrence', async () => {
    for (const portOptions of [occurrenceIn(SPIDHUB_ACCOUNT_ID), { environment: 'prod' }]) {
      const result = await new QuerySpidHubDiagnosticsStep().execute(
        await context(
          (query) => (query === ERROR_QUERY ? [[{ field: '@message', value: 'error' }]] : []),
          undefined,
          portOptions,
        ),
      );
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.vars?.['spidHubAccountId'], SPIDHUB_ACCOUNT_ID);
      assert.deepStrictEqual(
        result.output?.map((row) => row.find(({ field }) => field === 'sourceAccountId')?.value),
        [SPIDHUB_ACCOUNT_ID],
      );
    }
  });

  it('rejects other alarm names before contacting AWS', async () => {
    const ctx = await context(() => {
      assert.fail('Unexpected AWS read');
    });
    const result = await new QuerySpidHubDiagnosticsStep().execute({
      ...ctx,
      params: new Map([...ctx.params, ['alarmName', 'spidhub-uat-ExternalELBAlarm']]),
    });
    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /Unsupported SPID Hub production alarmName/u);
  });

  it('rejects non-production, other accounts and other regions before contacting AWS', async () => {
    for (const [portOptions, code, error] of [
      [occurrenceIn(SEND_ACCOUNT_IDS.confinfoUat), 'AWS_ACCOUNT_ENVIRONMENT_NOT_ALLOWED', /only environments prod/u],
      [{ environment: 'uat' }, 'AWS_ACCOUNT_ENVIRONMENT_NOT_ALLOWED', /only environments prod/u],
      [occurrenceIn(SEND_ACCOUNT_IDS.coreProd), 'AWS_OCCURRENCE_ACCOUNT_MISMATCH', /none of spidhub's accounts/u],
      [occurrenceIn(SPIDHUB_ACCOUNT_ID, 'eu-west-1'), 'AWS_OCCURRENCE_ACCOUNT_MISMATCH', /in region eu-west-1/u],
    ] as const) {
      const unexpectedRead: ReadQueryFn = () => assert.fail('Unexpected AWS read');
      await assert.rejects(async () => context(unexpectedRead, undefined, portOptions), rejectsWith(code));
      const result = await new QuerySpidHubDiagnosticsStep().execute(
        await context(unexpectedRead, undefined, portOptions, false),
      );
      assert.strictEqual(result.success, false);
      assert.match(result.error ?? '', error);
      assert.strictEqual(result.vars, undefined);
    }
  });

  it('declares the production SEND confinfo account', () => {
    assert.deepStrictEqual(new QuerySpidHubDiagnosticsStep().accountSelections(), [
      { subject: 'spidhub', accounts: ['send/confinfo'], scope: 'occurrence-account', environments: ['prod'] },
    ]);
    assert.deepStrictEqual(new QuerySpidHubDiagnosticsStep().getTraceInfo()['accounts'], ['send/confinfo']);
  });

  it('documents the manual ALB correlation and uses a case-insensitive bounded error query', () => {
    const trace = new QuerySpidHubDiagnosticsStep().getTraceInfo();
    assert.strictEqual(trace['albCorrelation'], 'MANUAL');
    assert.strictEqual(trace['logGroup'], 'spidhub-prod-hub-login');
    assert.match(ERROR_QUERY, /\(\?i\)/u);
    assert.ok(!ERROR_QUERY.includes("level = 'ERROR'"));
    assert.match(STREAM_QUERY, /by @logStream/u);
  });
});
