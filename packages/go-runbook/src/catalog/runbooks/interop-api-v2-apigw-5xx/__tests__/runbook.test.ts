import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AWSCloudWatchLogsQueryResult, ResultField } from '@go-automation/go-common/aws';
import { GOLogger } from '@go-automation/go-common/core';

import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { RUNBOOK_CATALOG } from '../../../RunbookCatalog.js';
import { INTEROP_API_V2_5XX_ALARM as alarm } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';

type Environment = 'prod' | 'att' | 'test';

interface Scenario {
  readonly environment?: Environment;
  readonly access?: ReadonlyArray<ReadonlyArray<ResultField>>;
  readonly application?: ReadonlyArray<ReadonlyArray<ResultField>>;
  readonly tracker?: ReadonlyArray<ReadonlyArray<ResultField>>;
}

function row(fields: Readonly<Record<string, string>>): ReadonlyArray<ResultField> {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

async function execute(scenario: Scenario): Promise<{
  readonly matchedIds: ReadonlyArray<string>;
  readonly draft: ReturnType<typeof buildAnalysisDraft>;
  readonly queries: ReadonlyArray<string>;
  readonly logGroups: ReadonlyArray<string>;
}> {
  const queries: string[] = [];
  const logGroups: string[] = [];
  const cloudWatchLogs = {
    async queryWithStatistics(groups: ReadonlyArray<string>, query: string): Promise<AWSCloudWatchLogsQueryResult> {
      await Promise.resolve();
      queries.push(query);
      logGroups.push(...groups);
      const rows = groups[0]?.startsWith('amazon-apigateway')
        ? (scenario.access ?? [row({ count: '1', status: '500', integrationError: '' })])
        : query.includes('filter cid =')
          ? (scenario.tracker ?? [])
          : (scenario.application ?? []);
      return {
        rows,
        statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
        queryExecutions: [],
      };
    },
  };
  const runbook = buildRunbook();
  const result = await new RunbookEngine(new GOLogger()).execute(
    runbook,
    new Map([
      ['alarmName', `interop-api-v2-${scenario.environment ?? 'prod'}-apigw-5xx`],
      ['startTime', '2026-09-24T09:55:00.000Z'],
      ['endTime', '2026-09-24T10:01:00.000Z'],
    ]),
    createTestServiceRegistry({ cloudWatchLogs }),
  );
  return {
    matchedIds: result.matchedCases.map(({ id }) => id),
    draft: buildAnalysisDraft(runbook, result),
    queries,
    logGroups,
  };
}

describe('INTEROP API v2 5xx runbook', () => {
  it('registers all documented environments with distinct API Gateway IDs and a read-only pipeline', () => {
    const ids = { prod: 'rudgz28tel', att: 'c786nyh6f4', test: 'jrafz6h9c9' };
    for (const [environment, apiGwId] of Object.entries(ids)) {
      const name = `interop-api-v2-${environment}-apigw-5xx`;
      assert.strictEqual(RUNBOOK_CATALOG.resolveByAlarmName(name)?.descriptor.key, alarm.runbookKey);
      assert.strictEqual(alarm.resolveContext(name).apiGwId, apiGwId);
      assert.strictEqual(
        alarm.resolveContext(name).apiGwLogGroup,
        `amazon-apigateway-interop-access-logs-${environment}`,
      );
      assert.strictEqual(
        alarm.resolveContext(name).applicationLogGroup,
        `/aws/eks/interop-eks-cluster-${environment}/application`,
      );
    }
    assert.throws(() => alarm.resolveContext('interop-api-v2-dev-apigw-5xx'), /Unsupported INTEROP alarm/u);

    const runbook = buildRunbook();
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 5, afterMinutes: 1 });
    assert.deepStrictEqual(
      runbook.steps.map(({ step }) => step.id),
      Object.values(alarm.stepIds),
    );
    assert.ok(runbook.analysisDefaults?.links?.some(({ url }) => url.includes('/2585526322/')));
  });

  it('finds the documented WARN that produces HTTP 500 in test and keeps the hotfix unconfirmed', async () => {
    const application = [
      row({
        '@message':
          '[CID=client-kind-cid] WARN errors: 012-0021, Unexpected client kind "API" for client id. ' +
          'forceGenericProblemOn500 is set to true, returning generic problem',
        pod_app: alarm.serviceName,
      }),
    ];
    const test = await execute({ environment: 'test', application });
    assert.match(test.queries[1] ?? '', /@message like \/Unexpected client kind\//u);
    assert.ok(test.queries[1]?.includes('pod_app like /interop\\-be\\-m2m\\-gateway/'));
    assert.deepStrictEqual(test.matchedIds, ['api-v2-unexpected-api-client-kind']);
    assert.strictEqual(test.draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(test.draft.proposedStatus, 'IN_PROGRESS');
    assert.deepStrictEqual(test.logGroups, [
      'amazon-apigateway-interop-access-logs-test',
      '/aws/eks/interop-eks-cluster-test/application',
      '/aws/eks/interop-eks-cluster-test/application',
    ]);

    const prod = await execute({ environment: 'prod', application });
    assert.deepStrictEqual(prod.matchedIds, []);
  });

  it('treats a gateway 504 as unresolved and never infers backend success from an application log', async () => {
    const timeout = 'Execution failed due to a timeout error';
    const gateway = await execute({
      access: [row({ count: '1', status: '504', integrationError: timeout, requestPath: '/v2/keyEvents' })],
    });
    assert.deepStrictEqual(gateway.matchedIds, ['api-v2-backend-timeout-504']);
    assert.strictEqual(gateway.draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(gateway.draft.proposedStatus, 'IN_PROGRESS');
    assert.match(gateway.queries[0] ?? '', /status >= 500 and status < 600/u);

    const applicationOnly = await execute({ application: [row({ '@message': timeout })] });
    assert.deepStrictEqual(applicationOnly.matchedIds, []);
  });

  it('traces a duplicate event through CID without assuming that a previous 2xx exists', async () => {
    const result = await execute({
      application: [row({ '@message': '[CID=purpose-cid] ERROR creating purpose', pod_app: alarm.serviceName })],
      tracker: [
        row({
          '@message':
            'errors: 006-9991, Error creating event: duplicate key value violates unique constraint ' +
            '"events_stream_id_version_key"',
          pod_app: 'interop-be-authorization-process',
        }),
      ],
    });
    assert.deepStrictEqual(result.matchedIds, ['api-v2-duplicate-event-version']);
    assert.strictEqual(result.draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(result.draft.proposedStatus, 'IN_PROGRESS');
    assert.match(result.queries[2] ?? '', /filter cid = "purpose-cid"/u);
  });

  it('limits the documented connection-closed example to test', async () => {
    const access = [
      row({
        count: '1',
        status: '504',
        requestPath: '/tenants/id',
        integrationError: 'Execution failed due to a network error communicating with endpoint: Connection is closed',
      }),
    ];
    assert.deepStrictEqual((await execute({ environment: 'test', access })).matchedIds, [
      'api-v2-endpoint-connection-closed',
    ]);
    assert.deepStrictEqual((await execute({ environment: 'prod', access })).matchedIds, []);
  });
});
