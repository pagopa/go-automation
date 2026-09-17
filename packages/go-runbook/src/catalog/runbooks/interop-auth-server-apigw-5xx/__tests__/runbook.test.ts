import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOLogger } from '@go-automation/go-common/core';
import type { AWSCloudWatchLogsQueryResult, ResultField } from '@go-automation/go-common/aws';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { RUNBOOK_CATALOG } from '../../../RunbookCatalog.js';
import { AUTH_SERVER_5XX_ALARM as alarm } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';
import { KNOWN_CASES } from '../knownCases.js';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import type { InteropEnvironment } from '../../interop/InteropEnvironment.js';

const FALLBACK =
  'Main auditing flow failed, going through fallback. Error: Timeout while acquiring lock (4 waiting locks): "connect to broker b-3.interopplatformevents.gfkljw.c4.kafka.eu-south-1.amazonaws.com:9098"';
const SUCCESS = [
  FALLBACK,
  'Storing file token-details/20260626/a.ndjson in bucket interop-generated-jwt-details-fallback-prod-es1',
  'Auditing succeeded through fallback',
  'Token generated',
];

function row(message: string, cid?: string): ReadonlyArray<ResultField> {
  return [
    { field: '@timestamp', value: '2026-09-11 10:00:00.000' },
    { field: 'pod_app', value: alarm.serviceName },
    { field: 'log', value: message },
    ...(cid === undefined ? [] : [{ field: 'cid', value: cid }]),
  ];
}

interface Scenario {
  readonly environment?: InteropEnvironment;
  readonly integrationError?: string;
  readonly application?: ReadonlyArray<ReadonlyArray<ResultField>>;
  readonly traces?: Readonly<Record<string, ReadonlyArray<string>>>;
}

async function execute(scenario: Scenario): Promise<{
  result: RunbookExecutionResult;
  draft: ReturnType<typeof buildAnalysisDraft>;
  queries: ReadonlyArray<string>;
  queriedLogGroups: ReadonlyArray<string>;
}> {
  const queries: string[] = [];
  const queriedLogGroups: string[] = [];
  const cloudWatchLogs = {
    async queryWithStatistics(logGroups: ReadonlyArray<string>, query: string): Promise<AWSCloudWatchLogsQueryResult> {
      await Promise.resolve();
      queries.push(query);
      queriedLogGroups.push(...logGroups);
      let rows: ReadonlyArray<ReadonlyArray<ResultField>>;
      if (logGroups[0]?.startsWith('amazon-apigateway') === true) {
        rows = [
          [
            { field: 'count', value: '1' },
            { field: 'status', value: '504' },
            { field: 'integrationError', value: scenario.integrationError ?? '' },
          ],
        ];
      } else if (query.includes('filter cid =')) {
        const cid = /filter cid = "([^"]+)"/u.exec(query)?.[1] ?? '';
        rows = (scenario.traces?.[cid] ?? []).map((message) => row(message));
      } else rows = scenario.application ?? [];
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
      ['alarmName', `interop-auth-server-${scenario.environment ?? 'prod'}-apigw-5xx`],
      ['startTime', '2026-09-11T09:55:00.000Z'],
      ['endTime', '2026-09-11T10:01:00.000Z'],
    ]),
    createTestServiceRegistry({ cloudWatchLogs }),
  );
  return { result, draft: buildAnalysisDraft(runbook, result), queries, queriedLogGroups };
}

describe('INTEROP auth-server 5xx runbook', () => {
  it('registers prod, att and test and preserves the 4xx registration', () => {
    const expectedIds = { prod: 'ffmbmcmreh', att: '70ar087an0', test: 'q9ocrukty2' };
    for (const [environment, apiGwId] of Object.entries(expectedIds)) {
      const name = `interop-auth-server-${environment}-apigw-5xx`;
      assert.strictEqual(RUNBOOK_CATALOG.resolveByAlarmName(name)?.descriptor.key, alarm.runbookKey);
      assert.strictEqual(alarm.resolveContext(name).environment, environment);
      assert.strictEqual(alarm.resolveContext(name).apiGwId, apiGwId);
    }
    assert.deepStrictEqual([...alarm.alarmNames].sort(), [
      'interop-auth-server-att-apigw-5xx',
      'interop-auth-server-prod-apigw-5xx',
      'interop-auth-server-test-apigw-5xx',
    ]);
    assert.strictEqual(
      RUNBOOK_CATALOG.resolveByAlarmName('interop-auth-server-prod-apigw-4xx')?.descriptor.key,
      'interop-auth-server-apigw-4xx',
    );
    for (const name of [
      'interop-auth-server-dev-apigw-5xx',
      'interop-auth-server-test-apigw-5xx-low-requests',
      'interop-auth-server-prod-apigw-4xx',
    ]) {
      assert.throws(() => alarm.resolveContext(name), /Unsupported INTEROP alarm/);
    }
    assert.strictEqual(alarm.resolveContext('interop-auth-server-prod-apigw-5xx').apiGwId, 'ffmbmcmreh');
    assert.deepStrictEqual(buildRunbook().occurrenceTimeWindow, { beforeMinutes: 5, afterMinutes: 1 });
    assert.deepStrictEqual(buildRunbook().cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.strictEqual(new Set(KNOWN_CASES.map((item) => item.id)).size, KNOWN_CASES.length);
    assert.strictEqual(new Set(KNOWN_CASES.map((item) => item.priority)).size, KNOWN_CASES.length);
    const actionable = KNOWN_CASES.filter((item) => item.analysis?.proposedStatus === 'IN_PROGRESS');
    const completed = KNOWN_CASES.filter((item) => item.analysis?.proposedStatus === 'COMPLETED');
    assert.ok(
      Math.min(...actionable.map((item) => item.priority)) > Math.max(...completed.map((item) => item.priority)),
    );
  });

  const cases = [
    ['auth-server-api-gateway-timeout', 'Execution failed due to a timeout error', 'API_GATEWAY', 'COMPLETED'],
    ['auth-server-waf-timeout', 'WAF call got timed out', 'API_GATEWAY', 'COMPLETED'],
    ['auth-server-waf-timeout', 'WAF call got timed out', 'APPLICATION', 'COMPLETED'],
    [
      'auth-server-kafka-lock-timeout',
      'ERROR - Timeout while acquiring lock (4 waiting locks): "connect to broker b-1.interopplatformevents.gfkljw.c4.kafka.eu-south-1.amazonaws.com:9098',
      'APPLICATION',
      'IN_PROGRESS',
    ],
    ['auth-server-audit-fallback-unverified', FALLBACK, 'APPLICATION', 'IN_PROGRESS'],
    [
      'auth-server-invalid-client-assertion-header',
      'Invalid claims in client assertion header: [{"code":"unrecognized_keys","keys":["x5c","use"],"path":[],"message":"Unrecognized keys"}]',
      'APPLICATION',
      'COMPLETED',
    ],
    [
      'auth-server-invalid-identity-token',
      "ERROR - InvalidIdentityTokenException: Couldn't retrieve verification key from your identity provider, please reference AssumeRoleWithWebIdentity documentation for requirements",
      'APPLICATION',
      'IN_PROGRESS',
    ],
    ['auth-server-waf-call-failed', 'wafError: Failed to call WAF', 'APPLICATION', 'IN_PROGRESS'],
    [
      'auth-server-stream-not-readable',
      'title: Unexpected error - detail: Unexpected error - errors: 007-9991, Unexpected error - original error: Error: Unexpected error',
      'APPLICATION',
      'IN_PROGRESS',
    ],
    ['auth-server-stream-not-readable', 'Error in request: stream is not readable', 'APPLICATION', 'IN_PROGRESS'],
    [
      'auth-server-endpoint-connection-reset',
      'Execution failed due to a network error communicating with endpoint: Connection reset by peer',
      'API_GATEWAY',
      'IN_PROGRESS',
    ],
  ] as const;
  for (const [id, message, source, status] of cases) {
    it(`recognizes ${id} from ${source}: ${message.slice(0, 35)}`, async () => {
      const scenario =
        source === 'API_GATEWAY'
          ? { integrationError: message }
          : { application: [row(message, 'cid-1')], traces: { 'cid-1': [message] } };
      const { result, draft } = await execute(scenario);
      assert.strictEqual(result.matchedCases[0]?.id, id);
      assert.strictEqual(draft?.kind, 'KNOWN_CASE');
      assert.strictEqual(draft.proposedStatus, status);
    });
  }

  it('queries 5xx and application errors, retaining invalid claims and following CIDs', async () => {
    const { queries } = await execute({ application: [row(FALLBACK, 'cid-1')] });
    assert.match(queries[0] ?? '', /apigwId = "ffmbmcmreh"/u);
    assert.match(queries[0] ?? '', /status >= 500/u);
    assert.match(queries[1] ?? '', /ERROR.*stderr.*Response/u);
    assert.ok(queries[1]?.includes('pod_app like /interop\\-be\\-authorization\\-server/'));
    assert.doesNotMatch(queries[1] ?? '', /not like.*Invalid claims/u);
    assert.match(queries[2] ?? '', /filter cid = "cid-1"/u);
  });

  it('confirms fallback recovery only after the complete sequence for every affected CID', async () => {
    const { result, draft } = await execute({
      application: [row(FALLBACK, 'a'), row(FALLBACK, 'b')],
      traces: { a: SUCCESS, b: SUCCESS },
    });
    assert.deepStrictEqual(
      result.matchedCases.map((item) => item.id),
      ['auth-server-audit-fallback-succeeded'],
    );
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'COMPLETED');
  });

  for (const environment of ['prod', 'att', 'test'] as const) {
    it(`uses the ${environment} API Gateway and log groups for the entire pipeline`, async () => {
      const expectedIds = { prod: 'ffmbmcmreh', att: '70ar087an0', test: 'q9ocrukty2' };
      const { queries, queriedLogGroups, draft } = await execute({
        environment,
        application: [row('wafError: Failed to call WAF', 'a')],
      });
      assert.ok(queries[0]?.includes(`apigwId = "${expectedIds[environment]}"`));
      assert.deepStrictEqual(queriedLogGroups, [
        `amazon-apigateway-interop-access-logs-${environment}`,
        `/aws/eks/interop-eks-cluster-${environment}/application`,
        `/aws/eks/interop-eks-cluster-${environment}/application`,
      ]);
      assert.strictEqual(draft?.kind, 'KNOWN_CASE');
      assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    });

    for (const bucketEnvironment of ['prod', 'att', 'test'] as const) {
      it(`confirms ${environment} fallback only for its own bucket: ${bucketEnvironment}`, async () => {
        const messages = SUCCESS.map((message) =>
          message.replace('fallback-prod-es1', `fallback-${bucketEnvironment}-es1`),
        );
        const { draft } = await execute({ environment, application: [row(FALLBACK, 'a')], traces: { a: messages } });
        assert.strictEqual(draft?.kind, 'KNOWN_CASE');
        assert.strictEqual(draft.proposedStatus, environment === bucketEnvironment ? 'COMPLETED' : 'IN_PROGRESS');
      });
    }
  }

  it('does not accept a bucket that merely starts with the expected bucket name', async () => {
    const messages = SUCCESS.map((message) => message.replace('fallback-prod-es1', 'fallback-prod-es1-unrelated'));
    const { draft } = await execute({ application: [row(FALLBACK, 'a')], traces: { a: messages } });
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
  });

  const incomplete = [
    { name: 'missing token', messages: SUCCESS.slice(0, 3) },
    { name: 'missing S3 write', messages: [FALLBACK, ...SUCCESS.slice(2)] },
    { name: 'missing audit success', messages: [FALLBACK, SUCCESS[1] ?? '', 'Token generated'] },
    { name: 'success precedes failure', messages: [...SUCCESS.slice(1), FALLBACK] },
    { name: 'another failure after success', messages: [...SUCCESS, FALLBACK] },
  ];
  for (const { name, messages } of incomplete) {
    it(`leaves fallback unresolved with ${name}`, async () => {
      const { draft } = await execute({ application: [row(FALLBACK, 'a')], traces: { a: messages } });
      assert.strictEqual(draft?.kind, 'KNOWN_CASE');
      assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    });
  }

  it('does not combine evidence from different CIDs or hide skipped/unavailable CIDs', async () => {
    const { draft } = await execute({
      application: [row(FALLBACK, 'a'), row(FALLBACK, 'b'), row(FALLBACK, 'unqueried')],
      traces: { a: SUCCESS.slice(0, 2), b: SUCCESS.slice(2) },
    });
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
  });

  it('does not hide failures without a CID behind a recovered request', async () => {
    const { draft } = await execute({ application: [row(FALLBACK), row(FALLBACK, 'a')], traces: { a: SUCCESS } });
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
  });

  it('keeps an independent WAF failure actionable even when audit fallback succeeds', async () => {
    const { result, draft } = await execute({
      application: [row(FALLBACK, 'a'), row('wafError: Failed to call WAF', 'b')],
      traces: { a: SUCCESS },
    });
    assert.strictEqual(result.matchedCases[0]?.id, 'auth-server-waf-call-failed');
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
  });

  it('retains unknown errors and does not treat an application timeout as an API Gateway timeout', async () => {
    for (const message of ['an unknown application failure', 'Execution failed due to a timeout error']) {
      const { result } = await execute({ application: [row(message)] });
      assert.deepStrictEqual(result.matchedCases, []);
    }
  });
});
