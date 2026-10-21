import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOLogger } from '@go-automation/go-common/core';
import type { ResultField } from '@go-automation/go-common/aws';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { assertAnalysisAnnotations } from '../../../../validation/assertAnalysisAnnotations.js';
import { RUNBOOK_CATALOG } from '../../../RunbookCatalog.js';
import { ConditionEvaluator, type RunbookContext } from '../../framework.js';
import { PUBLIC_CATALOG_STRAPI_ALARM as alarm } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';
import { KNOWN_CASES } from '../knownCases.js';
import { STRAPI_QUERY_PROFILE } from '../queryProfile.js';
import { executeRunbookForOccurrence } from '../../../executeRunbookForOccurrence.js';

function rows(messages: ReadonlyArray<string>): ReadonlyArray<ReadonlyArray<ResultField>> {
  return messages.map((log) => [
    { field: '@timestamp', value: '2026-10-06 00:35:22.766' },
    { field: 'pod_app', value: alarm.podApp },
    { field: 'stream', value: 'stderr' },
    { field: 'log', value: log },
    { field: '@message', value: JSON.stringify({ log, stream: 'stderr', pod_app: alarm.podApp }) },
  ]);
}

const FIXTURES = [
  ['public-catalog-strapi-connection-reset', '  Error: read ECONNRESET'],
  [
    'public-catalog-strapi-transfer-token-salt-warning',
    '(node:31) Warning: Missing transfer.token.salt: Data transfer features have been disabled.',
  ],
  [
    'public-catalog-strapi-startup-stderr',
    '! Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-9.15.9.tgz',
  ],
  [
    'public-catalog-strapi-startup-stderr',
    '[baseline-browser-mapping] The data in this module is over two months old.',
  ],
] as const;

describe('INTEROP public catalog Strapi runbook', () => {
  it('resolves prod/att/test aliases and refuses incomplete or unsupported names', () => {
    for (const env of ['prod', 'att', 'test']) {
      const name = `${alarm.runbookKey}-${env}-public-catalog`;
      const context = alarm.resolveContext(name);
      assert.strictEqual(context.environment, env);
      assert.strictEqual(context.logGroup, `/aws/eks/interop-eks-cluster-${env}/application`);
      assert.strictEqual(RUNBOOK_CATALOG.resolveByAlarmName(name)?.descriptor.key, alarm.runbookKey);
      assert.strictEqual(RUNBOOK_CATALOG.resolveByAlarmName(name)?.descriptor.kind, 'K8S');
    }
    for (const name of [alarm.runbookKey, `${alarm.runbookKey}-prod`, `${alarm.runbookKey}-dev-public-catalog`])
      assert.throws(() => alarm.resolveContext(name), /Unsupported INTEROP alarm name/);
    assert.deepStrictEqual(buildRunbook().cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.doesNotThrow(() => assertCloudExecutableRunbook(buildRunbook()));
    assert.doesNotThrow(() => assertAnalysisAnnotations(buildRunbook(), 'INTEROP'));
  });

  it('reads raw Strapi error lines with an exact service filter and preserves collector UTC timestamps', () => {
    const query = STRAPI_QUERY_PROFILE.buildApplicationLogsQuery(alarm.podApp);
    assert.match(query, /filter pod_app = "interop-public-catalog-strapi"/);
    assert.match(query, /filter log like \/ERROR\/ or stream = "stderr"/);
    assert.match(query, /@logStream, stream, log, @message/);
    assert.match(query, /sort @timestamp asc/);
    assert.doesNotMatch(query, /parse log|dedup/);
  });

  it('recognizes production signatures only in Strapi evidence, not other CID-tracker services', () => {
    const evaluator = new ConditionEvaluator();
    const stepResults = new Map<string, unknown>();
    const vars = new Map([['interopEnvironment', 'prod']]);
    const ctx: RunbookContext = {
      executionId: 'test',
      startedAt: new Date(),
      stepResults,
      vars,
      params: new Map(),
      logs: [],
      recoveredErrors: [],
      services: createTestServiceRegistry(),
    };
    for (const [id, message] of FIXTURES) {
      const knownCase = KNOWN_CASES.find((c) => c.id === id);
      assert.ok(knownCase);
      stepResults.set(alarm.stepIds.queryApplicationLogs, rows([message]));
      assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), true, id);
      vars.set('interopEnvironment', 'att');
      assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), false);
      vars.set('interopEnvironment', 'prod');
      stepResults.set(alarm.stepIds.queryApplicationLogs, []);
      stepResults.set(alarm.stepIds.queryCidTracker, [
        {
          cid: 'test-cid',
          rows: [
            [
              { field: 'pod_app', value: 'interop-public-catalog-astro-frontend' },
              { field: 'log', value: message },
            ],
          ],
        },
      ]);
      assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), false);
    }
  });

  for (const [label, messages, expectedCase] of [
    ['mixed production startup and ECONNRESET', FIXTURES.map((f) => f[1]), 'public-catalog-strapi-connection-reset'],
    ['data transfer warning alone', [FIXTURES[1][1]], 'public-catalog-strapi-transfer-token-salt-warning'],
    ['Corepack stderr alone', [FIXTURES[2][1]], 'public-catalog-strapi-startup-stderr'],
  ] as const) {
    it(`collects context without CID before resolving ${label} and keeps verification open`, async () => {
      const queries: string[] = [];
      const runbook = buildRunbook();
      const evidence = rows(messages);
      const result = await new RunbookEngine(new GOLogger()).execute(
        runbook,
        new Map([
          ['alarmName', `${alarm.runbookKey}-prod-public-catalog`],
          ['startTime', '2026-10-06T00:31:08Z'],
          ['endTime', '2026-10-06T00:41:08Z'],
        ]),
        createTestServiceRegistry({
          cloudWatchLogs: {
            // eslint-disable-next-line @typescript-eslint/require-await
            async queryWithStatistics(_groups: ReadonlyArray<string>, query: string) {
              queries.push(query);
              return {
                rows: query.includes('limit 1000')
                  ? rows(['> strapi start', 'HTTP GET /admin/register-admin 200', ...messages])
                  : evidence,
                statistics: { bytesScanned: 1, recordsMatched: evidence.length, recordsScanned: 1 },
                queryExecutions: [],
              };
            },
          },
        }),
      );
      assert.strictEqual(result.status, 'completed');
      assert.strictEqual(queries.length, 2); // CID tracker skips when no CID is available.
      assert.ok(queries[1]?.includes('limit 1000'));
      const draft = buildAnalysisDraft(runbook, result);
      assert.strictEqual(draft?.kind, 'KNOWN_CASE');
      assert.strictEqual(result.matchedCases[0]?.id, expectedCase);
      assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
      assert.strictEqual(draft.analysisType, 'ANALYZABLE');
      assert.strictEqual(draft.ignoreReasonCode, undefined);
    });
  }

  it('does not treat empty scans or inaccessible context as verified recovery', async () => {
    for (const denied of [false, true]) {
      const runbook = buildRunbook();
      const result = await new RunbookEngine(new GOLogger()).execute(
        runbook,
        new Map([
          ['alarmName', `${alarm.runbookKey}-prod-public-catalog`],
          ['startTime', '2026-10-06T00:31:08Z'],
          ['endTime', '2026-10-06T00:41:08Z'],
        ]),
        createTestServiceRegistry({
          cloudWatchLogs: {
            // eslint-disable-next-line @typescript-eslint/require-await
            async queryWithStatistics(_groups: ReadonlyArray<string>, query: string) {
              if (denied && query.includes('limit 1000')) throw new Error('AccessDenied');
              const evidence = denied ? rows([FIXTURES[0][1]]) : [];
              return {
                rows: evidence,
                statistics: { bytesScanned: 1, recordsMatched: evidence.length, recordsScanned: evidence.length },
                queryExecutions: [],
              };
            },
          },
        }),
      );
      if (denied) assert.strictEqual(result.status, 'failed');
      else {
        assert.strictEqual(result.status, 'completed');
        assert.deepStrictEqual(result.matchedCases, []);
      }
      assert.notStrictEqual(buildAnalysisDraft(runbook, result)?.kind, 'KNOWN_CASE');
    }
  });

  it('exports startup, stderr warnings and HTTP stdout in the serialized cloud occurrence', async () => {
    const contextMessages = [
      { stream: 'stdout', log: '> strapi start' },
      { stream: 'stderr', log: FIXTURES[1][1] },
      { stream: 'stdout', log: 'HTTP GET /admin/register-admin 200' },
      ...Array.from({ length: 6 }, () => ({ stream: 'stderr', log: FIXTURES[0][1] })),
    ];
    const contextRows = contextMessages.map(({ log, stream }, index) => [
      { field: '@timestamp', value: `2026-10-06T00:35:0${String(index)}Z` },
      { field: 'pod_app', value: alarm.podApp },
      { field: 'stream', value: stream },
      { field: 'log', value: log },
      { field: '@message', value: JSON.stringify({ log, stream, pod_app: alarm.podApp }) },
    ]);
    const output = await executeRunbookForOccurrence(
      {
        logger: new GOLogger(),
        services: createTestServiceRegistry({
          cloudWatchLogs: {
            // eslint-disable-next-line @typescript-eslint/require-await
            async queryWithStatistics(_groups: ReadonlyArray<string>, query: string) {
              const resultRows = query.includes('limit 1000') ? contextRows : rows([FIXTURES[0][1]]);
              return {
                rows: resultRows,
                statistics: { bytesScanned: 1, recordsMatched: resultRows.length, recordsScanned: resultRows.length },
                queryExecutions: [],
              };
            },
          },
        }),
      },
      {
        alarmName: `${alarm.runbookKey}-prod-public-catalog`,
        firedAt: '2026-10-06T00:36:08Z',
        awsAccountId: '111111111111',
        region: 'eu-south-1',
        awsProfiles: [],
        executionMode: 'cloud',
      },
    );
    const serialized = JSON.parse(JSON.stringify(output)) as typeof output;
    const evidence = serialized.context.evidence.find(
      ({ sourceStep }) => sourceStep === 'query-public-catalog-strapi-context',
    );
    assert.ok(evidence, 'missing Strapi startup and HTTP context in the occurrence result');
    assert.strictEqual(evidence.type, 'log-sample');
    assert.strictEqual(evidence.truncated, false);
    assert.deepStrictEqual(
      evidence.items?.map(({ message }) => message),
      contextMessages.map(({ log, stream }) => JSON.stringify({ log, stream, pod_app: alarm.podApp })),
    );
    assert.ok(serialized.context.evidence.some(({ sourceStep }) => sourceStep === alarm.stepIds.queryApplicationLogs));
    assert.strictEqual(serialized.analysis?.kind, 'KNOWN_CASE');
    assert.strictEqual(serialized.analysis.proposedStatus, 'IN_PROGRESS');
  });
});
