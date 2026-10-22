import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AWSCloudWatchLogsQueryResult, ResultField } from '@go-automation/go-common/aws';
import { GOLogger } from '@go-automation/go-common/core';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { ConditionEvaluator, type RunbookContext } from '../../framework.js';
import { KNOWN_CASES } from '../knownCases.js';
import { API_GW_LOG_GROUP } from '../knownServices.js';
import { buildRunbook } from '../runbook.js';
import { executeRunbookForOccurrence } from '../../../executeRunbookForOccurrence.js';

type Rows = ReadonlyArray<ReadonlyArray<ResultField>>;
const TRACE = '1-6ad1eae3-493a74b231f3e345492729e9';

async function execute(
  errors: Rows = [],
  completion: Rows = [],
  errorMessage = 'Endpoint request timed out',
): Promise<{
  readonly result: RunbookExecutionResult;
  readonly queries: ReadonlyArray<string>;
  readonly draft: ReturnType<typeof buildAnalysisDraft>;
}> {
  const queries: string[] = [];
  const cloudWatchLogs = {
    async queryWithStatistics(groups: ReadonlyArray<string>, query: string): Promise<AWSCloudWatchLogsQueryResult> {
      await Promise.resolve();
      queries.push(query);
      const rows: Rows =
        groups[0] === API_GW_LOG_GROUP
          ? [
              [
                { field: '@timestamp', value: '2026-10-16 09:14:11.382' },
                { field: 'xrayTraceId', value: `Root=${TRACE}` },
                { field: 'status', value: '504' },
                { field: 'httpMethod', value: 'POST' },
                { field: 'path', value: '/national-registries-private/infocamere/legal-institutions' },
                { field: 'errorMessage', value: errorMessage },
              ],
            ]
          : query.includes('Checking [INFO CAMERE] legal institutions passed')
            ? completion
            : errors;
      return {
        rows,
        statistics: { recordsScanned: rows.length, recordsMatched: rows.length, bytesScanned: 1 },
        queryExecutions: [],
      };
    },
  };
  const runbook = buildRunbook();
  const result = await new RunbookEngine(new GOLogger()).execute(
    runbook,
    new Map([
      ['alarmName', runbook.metadata.id],
      ['alarmDatetime', '2026-10-16T09:15:04Z'],
      ['startTime', '2026-10-16T09:10:04Z'],
      ['endTime', '2026-10-16T09:20:05Z'],
    ]),
    createTestServiceRegistry({ cloudWatchLogs }),
  );
  return { result, queries, draft: buildAnalysisDraft(runbook, result) };
}

describe('PNPG national registries diagnosis', () => {
  it('queries completion before the service decision can stop traversal', () => {
    const runbook = buildRunbook();
    const ids = runbook.steps.map(({ step }) => step.id);
    assert.ok(ids.indexOf('query-national-registries-completion') < ids.indexOf('query-pn-national-registries'));
    assert.ok(ids.indexOf('query-national-registries-completion') < ids.indexOf('decide-pn-national-registries'));
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.ok(runbook.analysisDefaults?.links?.some(({ url }) => url.includes('/2111700993/')));
  });

  it('recognizes the observed 504 with later application completion without claiming caller recovery', async () => {
    const completion: Rows = [
      [
        { field: '@timestamp', value: '2026-10-16 09:14:43.923' },
        { field: 'level', value: 'INFO' },
        { field: 'message', value: 'Checking [INFO CAMERE] legal institutions passed' },
        { field: 'trace_id', value: TRACE },
      ],
    ];
    const { result, queries, draft } = await execute([], completion);
    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(result.matchedCases[0]?.id, 'apigw-504-legal-institutions-completion-observed');
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.deepStrictEqual(draft.downstreams, []);

    const query = queries.find((query) => query.includes('Checking [INFO CAMERE] legal institutions passed'));
    assert.ok(query?.includes(TRACE));
    assert.ok(query?.includes('message = "Checking [INFO CAMERE] legal institutions passed"'));
    assert.match(query ?? '', /display @timestamp, level, message, trace_id/u);
    assert.doesNotMatch(query ?? '', /display.*@message|Using jwt|Result: <200/u);
  });

  it('exports completion timestamps and trace alongside the 504 when the application error scan is empty', async () => {
    const completion = [
      { timestamp: '2026-10-16T09:13:40Z', message: 'Starting process _infoCamereLegalInstitutions' },
      { timestamp: '2026-10-16T09:14:43Z', message: 'Checking [INFO CAMERE] legal institutions passed' },
      { timestamp: '2026-10-16T09:14:44Z', message: 'Ending process _infoCamereLegalInstitutions' },
    ];
    const queries: string[] = [];
    const output = await executeRunbookForOccurrence(
      {
        logger: new GOLogger(),
        services: createTestServiceRegistry({
          cloudWatchLogs: {
            // eslint-disable-next-line @typescript-eslint/require-await
            async queryWithStatistics(groups: ReadonlyArray<string>, query: string) {
              queries.push(query);
              const resultRows: Rows =
                groups[0] === API_GW_LOG_GROUP
                  ? [
                      [
                        { field: '@timestamp', value: '2026-10-16T09:14:11Z' },
                        { field: 'xrayTraceId', value: `Root=${TRACE}` },
                        { field: 'status', value: '504' },
                        { field: 'httpMethod', value: 'POST' },
                        { field: 'path', value: '/national-registries-private/infocamere/legal-institutions' },
                        { field: 'errorMessage', value: 'Endpoint request timed out' },
                        { field: '@message', value: JSON.stringify({ status: 504, xrayTraceId: `Root=${TRACE}` }) },
                      ],
                    ]
                  : query.includes('Checking [INFO CAMERE] legal institutions passed')
                    ? completion.map(({ timestamp, message }) => [
                        { field: '@timestamp', value: timestamp },
                        { field: 'level', value: 'INFO' },
                        { field: 'message', value: message },
                        { field: 'trace_id', value: TRACE },
                      ])
                    : [];
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
        alarmName: 'pn-national-registries-PNPG-ApiGwAlarm',
        firedAt: '2026-10-16T09:15:04Z',
        awsAccountId: '111111111111',
        region: 'eu-south-1',
        awsProfiles: [],
        executionMode: 'cloud',
      },
    );
    const serialized = JSON.parse(JSON.stringify(output)) as typeof output;
    const evidence = serialized.context.evidence.find(
      ({ sourceStep }) => sourceStep === 'query-national-registries-completion',
    );
    assert.ok(evidence, 'missing application completion evidence in the occurrence result');
    assert.strictEqual(evidence.type, 'log-sample');
    assert.strictEqual(evidence.truncated, false);
    assert.deepStrictEqual(
      evidence.items?.map(({ timestamp, message, trace_id: traceId }) => ({ timestamp, message, trace_id: traceId })),
      completion.map(({ timestamp, message }) => ({ timestamp, message, trace_id: TRACE })),
    );
    const gateway = serialized.context.evidence.find(({ sourceStep }) => sourceStep === 'query-api-gw-logs');
    assert.strictEqual(gateway?.items?.[0]?.['timestamp'], '2026-10-16T09:14:11Z');
    assert.ok(gateway?.items?.[0]?.['message']?.includes('504'));
    assert.ok(queries.some((query) => query.includes("level == 'ERROR'")));
    assert.ok(!serialized.context.evidence.some(({ sourceStep }) => sourceStep === 'query-pn-national-registries'));
    assert.strictEqual(serialized.outcome.kind, 'known-case-matched');
    assert.strictEqual(serialized.outcome.primaryCaseId, 'apigw-504-legal-institutions-completion-observed');
    assert.strictEqual(serialized.analysis?.kind, 'KNOWN_CASE');
    assert.strictEqual(serialized.analysis.proposedStatus, 'IN_PROGRESS');
  });

  it('keeps a 504 with no application evidence open without assigning INAD or InfoCamere as cause', async () => {
    const { result, draft } = await execute();
    assert.ok(result.matchedCases.some(({ id }) => id === 'apigw-504-infocamere-inad-timeout'));
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.deepStrictEqual(draft.downstreams, []);
  });

  it('keeps the generic gateway timeout open instead of declaring a transient recovered error', async () => {
    const { result, draft } = await execute([], [], 'Execution failed due to a timeout error');
    assert.deepStrictEqual(
      result.matchedCases.map(({ id }) => id),
      ['apigw-504-timeout'],
    );
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
  });

  it('matches the documented connection timeouts only for their actual host and service', () => {
    const evaluator = new ConditionEvaluator();
    for (const [id, service, host] of [
      ['downstream-inad-connect-timeout', 'INAD', 'api.inad.gov.it'],
      ['downstream-ade-connect-timeout', 'AdE', 'gatewaywebservices.agenziaentrate.it'],
    ]) {
      const knownCase = KNOWN_CASES.find((candidate) => candidate.id === id);
      assert.ok(knownCase);
      const stepResults = new Map<string, unknown>();
      const context: RunbookContext = {
        executionId: 'test',
        startedAt: new Date(),
        params: new Map(),
        vars: new Map(),
        logs: [],
        stepResults,
        services: createTestServiceRegistry(),
        recoveredErrors: [],
      };
      stepResults.set('query-pn-national-registries', [
        `[DOWNSTREAM] Service ${service} returned errors=connection timed out after 3000 ms: ${host}/192.0.2.1:443`,
      ]);
      assert.strictEqual(evaluator.evaluate(knownCase.condition, context), true);
      stepResults.set('query-pn-national-registries', [
        `[DOWNSTREAM] Service ${service} returned errors=connection timed out after 3000 ms: unrelated.example`,
      ]);
      assert.strictEqual(evaluator.evaluate(knownCase.condition, context), false);
    }
  });

  it('requires follow-up for every known case and preserves the evidence titles of existing cases', () => {
    for (const knownCase of KNOWN_CASES) {
      assert.strictEqual(knownCase.analysis?.proposedStatus, 'IN_PROGRESS');
    }
    const ade = KNOWN_CASES.find(({ id }) => id === 'downstream-ade-500-verifica-legale-rappresentante');
    assert.ok(ade?.action.type === 'log');
    assert.strictEqual(ade.action.title, '[DOWNSTREAM] Service AdE returned errors=500 Internal Server Error');
  });
});
