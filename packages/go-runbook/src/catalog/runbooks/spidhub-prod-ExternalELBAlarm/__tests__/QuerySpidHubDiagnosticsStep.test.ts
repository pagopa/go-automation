import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ResultField } from '@go-automation/go-common/aws';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import type { RunbookContext } from '../../framework.js';
import { QuerySpidHubDiagnosticsStep } from '../QuerySpidHubDiagnosticsStep.js';
import { ERROR_QUERY, SPIDHUB_ACCOUNT_ID, SPIDHUB_LOG_GROUP, STREAM_QUERY } from '../alarmDefinition.js';

type Rows = ReadonlyArray<ReadonlyArray<ResultField>>;
type ReadQueryFn = (query: string) => Rows;
const RESPONDER =
  '[io-spid-commons] error: Spid Authentication|Authentication Error|ERROR=Error: Value attribute of StatusCode is invalid: urn:oasis:names:tc:SAML:2.0:status:Responder';

function context(read: ReadQueryFn, signal?: AbortSignal): RunbookContext {
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
    services: createTestServiceRegistry({
      cloudWatchLogs: {
        forTarget(target: { accountId: string; region: string }) {
          assert.deepStrictEqual(target, { accountId: SPIDHUB_ACCOUNT_ID, region: 'eu-south-1' });
          return {
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
          };
        },
      },
    }),
    recoveredErrors: [],
    ...(signal === undefined ? {} : { signal }),
  };
}

describe('QuerySpidHubDiagnosticsStep', () => {
  it('collects both queries before matching and retains duplicate application evidence', async () => {
    const messages = [RESPONDER, RESPONDER, 'Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent'];
    const ctx = context((query) =>
      query === ERROR_QUERY
        ? messages.map((value) => [{ field: '@message', value }])
        : [[{ field: '@logStream', value: 'task-1' }]],
    );
    const result = await new QuerySpidHubDiagnosticsStep().execute(ctx);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output?.length, 4);
    assert.deepStrictEqual(result.vars, {
      spidHubDiagnostics: 'COLLECTED',
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
      context((query) =>
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
    const result = await new QuerySpidHubDiagnosticsStep().execute(context(() => []));
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars?.['spidHubDiagnostics'], 'COLLECTED');
    assert.strictEqual(result.vars?.['spidHubErrorLogCount'], '0');
    assert.strictEqual(result.next, undefined);
  });

  it('forwards the caller cancellation signal to both AWS queries', async () => {
    const controller = new AbortController();
    const result = await new QuerySpidHubDiagnosticsStep().execute(context(() => [], controller.signal));
    assert.strictEqual(result.success, true);
  });

  for (const saturatedQuery of [ERROR_QUERY, STREAM_QUERY]) {
    it(`fails on a saturated ${saturatedQuery === ERROR_QUERY ? 'error scan' : 'stream inventory'}`, async () => {
      const result = await new QuerySpidHubDiagnosticsStep().execute(
        context((query) => (query === saturatedQuery ? Array.from({ length: 1000 }, () => []) : [])),
      );
      assert.strictEqual(result.success, false);
      assert.match(result.error ?? '', /reached 1000 rows/u);
      assert.strictEqual(result.vars, undefined);
    });
  }

  it('fails on access errors without publishing partial diagnostics', async () => {
    const result = await new QuerySpidHubDiagnosticsStep().execute(
      context((query) => {
        if (query === STREAM_QUERY) throw new Error('AccessDenied');
        return [[{ field: '@message', value: RESPONDER }]];
      }),
    );
    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /AccessDenied/u);
    assert.strictEqual(result.vars, undefined);
  });

  it('rejects other accounts, regions and alarm names before contacting AWS', async () => {
    for (const [param, value] of [
      ['awsAccountId', '510769970275'],
      ['awsRegion', 'eu-west-1'],
      ['alarmName', 'spidhub-uat-ExternalELBAlarm'],
    ]) {
      const ctx = context(() => {
        assert.fail('Unexpected AWS read');
      });
      const result = await new QuerySpidHubDiagnosticsStep().execute({
        ...ctx,
        params: new Map([...ctx.params, [param ?? '', value ?? '']]),
      });
      assert.strictEqual(result.success, false);
      assert.match(result.error ?? '', /Unsupported SPID Hub production/u);
    }
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
