import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AWSCloudWatchLogsQueryResult, ResultField } from '@go-automation/go-common/aws';
import { GOLogger } from '@go-automation/go-common/core';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import { RUNBOOK_CATALOG } from '../../../RunbookCatalog.js';
import { computeRunbookTimeRange } from '../../../computeRunbookTimeRange.js';
import { buildRunbook } from '../runbook.js';
import { API_GW_LOG_GROUP } from '../knownServices.js';

const ALARM = 'pn-bff-WEB-noextension-Addresses-comp-5xx-ApiGwAlarm';
const ROOT = '1-68ef9670-111111111111111111111111';
const TIMEOUT =
  'Ending process _getAddressesV1 with errors=nested exception is io.netty.handler.timeout.ReadTimeoutException';

function row(fields: Record<string, string>): ReadonlyArray<ResultField> {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

interface Scenario {
  readonly emptyAccess?: boolean;
  readonly denyAccess?: boolean;
  readonly status?: string;
  readonly authorizerStatus?: string;
  readonly authorizerLatency?: string;
  readonly errorMessage?: string;
  readonly method?: string;
  readonly path?: string;
  readonly messages?: ReadonlyArray<string>;
  readonly root?: string;
}

interface TestExecution {
  readonly result: RunbookExecutionResult;
  readonly draft: ReturnType<typeof buildAnalysisDraft>;
  readonly queries: ReadonlyArray<{ readonly group: string; readonly query: string }>;
}

async function execute(scenario: Scenario = {}): Promise<TestExecution> {
  const queries: { readonly group: string; readonly query: string }[] = [];
  const runbook = buildRunbook();
  const result = await new RunbookEngine(new GOLogger()).execute(
    runbook,
    new Map([
      ['alarmName', ALARM],
      ['startTime', '2026-10-15T11:55:29.929Z'],
      ['endTime', '2026-10-15T12:05:29.929Z'],
    ]),
    createTestServiceRegistry({
      cloudWatchLogs: {
        async queryWithStatistics(
          groups: ReadonlyArray<string>,
          query: string,
          _range: unknown,
          options?: { readonly logGroupResolutionMode?: string },
        ): Promise<AWSCloudWatchLogsQueryResult> {
          await Promise.resolve();
          assert.equal(options?.logGroupResolutionMode, 'search-configured-profiles');
          const group = groups[0] ?? '';
          queries.push({ group, query });
          let rows: ReadonlyArray<ReadonlyArray<ResultField>>;
          if (group === API_GW_LOG_GROUP) {
            if (scenario.denyAccess === true) throw new Error('AccessDenied');
            rows =
              scenario.emptyAccess === true
                ? []
                : [
                    row({
                      status: scenario.status ?? '500',
                      httpMethod: scenario.method ?? 'GET',
                      path: scenario.path ?? '/bff/v1/addresses',
                      xrayTraceId: `Root=${scenario.root ?? ROOT}`,
                      requestId: 'request-id',
                      authorizerStatus: scenario.authorizerStatus ?? '200',
                      authorizerLatency: scenario.authorizerLatency ?? '5',
                      integrationServiceStatus: '500',
                      errorMessage: scenario.errorMessage ?? '-',
                    }),
                  ];
          } else if (group.startsWith('API-Gateway-Execution-Logs_')) {
            rows = [];
          } else {
            assert.equal(group, '/aws/ecs/pn-bff');
            rows = (scenario.messages ?? [TIMEOUT]).map((message) =>
              row({
                level: 'WARN',
                message,
                trace_id: ROOT,
                '@message': JSON.stringify({ level: 'WARN', message, trace_id: ROOT }),
              }),
            );
          }
          return {
            rows,
            statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
            queryExecutions: [],
          };
        },
      },
    }),
  );
  return { result, draft: buildAnalysisDraft(runbook, result), queries };
}

describe('WEB Addresses API Gateway runbook', () => {
  it('registers a read-only SEND runbook with the documented diagnostic window', () => {
    const registered = RUNBOOK_CATALOG.resolveByAlarmName(ALARM);
    assert.ok(registered);
    assert.equal(registered.product, 'SEND');
    assert.equal(registered.descriptor.kind, 'APIGW');
    const runbook = registered.build();
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.deepEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.deepEqual(computeRunbookTimeRange(runbook, { kind: 'single', at: '2026-10-15T12:00:29.929Z' }), {
      startTime: '2026-10-15T11:55:29.929Z',
      endTime: '2026-10-15T12:05:29.929Z',
    });
    assert.ok(runbook.analysisDefaults?.links?.[0]?.url.includes('/2865397761/'));
  });

  it('recognizes the documented WARN timeout and retains the full X-Ray root', async () => {
    const { result, draft, queries } = await execute();
    assert.equal(result.status, 'completed');
    assert.deepEqual(
      result.matchedCases.map(({ id }) => id),
      ['bff-get-addresses-read-timeout'],
    );
    assert.equal(draft?.kind, 'KNOWN_CASE');
    assert.equal(draft.proposedStatus, 'IN_PROGRESS');
    assert.equal(draft.conclusionNotes, 'Risoluzione non documentata.');
    assert.deepEqual(draft.finalActions, []);
    assert.equal(result.finalContext.vars.get('xRayTraceId'), ROOT);
    const bff = queries.find(({ group }) => group === '/aws/ecs/pn-bff');
    assert.ok(bff);
    assert.ok(bff.query.includes(ROOT));
    assert.ok(!bff.query.includes("level == 'ERROR'"));
  });

  it('scopes the access query to all three verified Addresses method/resource pairs', async () => {
    const { queries } = await execute();
    const query = queries[0]?.query ?? '';
    assert.ok(query.includes("httpMethod = 'GET'"));
    assert.ok(query.includes("httpMethod in ['POST', 'DELETE']"));
    assert.ok(query.includes("resourcePath = '/v1/addresses'"));
    assert.ok(query.includes("resourcePath = '/v1/addresses/{addressType}/{senderId}/{channelType}'"));
    assert.ok(query.includes('not ispresent(resourcePath)'));
    assert.ok(query.includes('status >= 500 or authorizerStatus >= 500 or integrationServiceStatus >= 500'));
  });

  it('broadens to scoped 4xx only after an empty successful 5xx query', async () => {
    const { result, queries } = await execute({ emptyAccess: true });
    assert.equal(queries.length, 2);
    assert.ok(queries[0]?.query.includes('status >= 500'));
    assert.ok(queries[1]?.query.includes('status >= 400'));
    assert.ok(queries.every(({ query }) => query.includes("resourcePath = '/v1/addresses'")));
    assert.deepEqual(result.matchedCases, []);
  });

  it('keeps a failed query distinct from an empty result and does not broaden it', async () => {
    const { result, queries } = await execute({ denyAccess: true });
    assert.equal(result.status, 'failed');
    assert.equal(queries.length, 1);
    assert.deepEqual(result.matchedCases, []);
  });

  it('continues to application evidence after an empty execution-log enrichment', async () => {
    const { result, queries } = await execute({ errorMessage: 'Execution failed due to an internal error' });
    assert.ok(queries.some(({ group }) => group.startsWith('API-Gateway-Execution-Logs_')));
    assert.ok(queries.some(({ group }) => group === '/aws/ecs/pn-bff'));
    assert.equal(result.matchedCases[0]?.id, 'bff-get-addresses-read-timeout');
  });

  it('recognizes the configured authorizer timeout without declaring recovery', async () => {
    const { result, draft, queries } = await execute({ authorizerStatus: '500', authorizerLatency: '5000' });
    assert.equal(result.matchedCases[0]?.id, 'api-gw-authorizer-timeout');
    assert.equal(draft?.kind, 'KNOWN_CASE');
    assert.equal(draft?.proposedStatus, 'IN_PROGRESS');
    assert.equal(draft?.conclusionNotes, 'Risoluzione non documentata.');
    assert.ok(queries.every(({ group }) => group !== '/aws/ecs/pn-bff'));
  });

  it('does not classify an undocumented operation or a generic BFF failure', async () => {
    for (const messages of [
      [],
      ['ERROR - Internal Server Error'],
      [TIMEOUT.replace('_getAddressesV1', '_deleteAddressV1')],
    ]) {
      const { result, draft } = await execute({ messages });
      assert.deepEqual(result.matchedCases, []);
      assert.equal(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
    }
  });

  it('keeps a later successful log from closing the documented timeout', async () => {
    const { draft } = await execute({ messages: [TIMEOUT, 'Request completed successfully'] });
    assert.equal(draft?.kind, 'KNOWN_CASE');
    assert.equal(draft?.proposedStatus, 'IN_PROGRESS');
    assert.deepEqual(draft?.finalActions, []);
  });
});
