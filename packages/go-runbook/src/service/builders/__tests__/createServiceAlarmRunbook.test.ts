import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ResultField } from '@go-automation/go-common/aws';
import { GOLogger } from '@go-automation/go-common/core';

import { CloudWatchLogsQueryStep } from '../../../steps/data/CloudWatchLogsQueryStep.js';
import { buildRunbookOutput } from '../../../output/buildRunbookOutput.js';
import { RunbookEngine } from '../../../core/RunbookEngine.js';
import { knownCase } from '../../../builders/knownCase.js';
import { createServiceAlarmRunbook } from '../createServiceAlarmRunbook.js';
import type { ServiceAlarmConfig } from '../../types/ServiceAlarmConfig.js';
import { isServiceRunbookContext } from '../../output/ServiceRunbookContext.js';
import { buildServiceOutputContext } from '../../output/buildServiceOutputContext.js';
import type { RunbookExecutionResult } from '../../../types/RunbookExecutionResult.js';
import type { RunbookExecutionTrace } from '../../../trace/RunbookExecutionTrace.js';
import { createTestServiceRegistry } from '../../../registry/createTestServiceRegistry.js';

function baseConfig(overrides: Partial<ServiceAlarmConfig> = {}): ServiceAlarmConfig {
  return {
    id: 'service-alarm',
    metadata: {
      name: 'Service alarm',
      description: 'desc',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['service'],
    },
    service: {
      name: 'pn-service',
      logGroup: '/aws/ecs/pn-service',
      varPrefix: 'pnService',
    },
    knownCases: [],
    ...overrides,
  };
}

function row(fields: Record<string, string>): ResultField[] {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

function fakeResult(): RunbookExecutionResult {
  const vars = new Map<string, string>([
    ['pnServiceLogCount', '1'],
    ['pnServiceTraceId', '1-abcdef12-1234567890abcdef12345678'],
    ['pnServiceTraceLogCount', '2'],
    ['pnServiceErrorMsg', 'boom'],
  ]);

  return {
    runbookId: 'service-alarm',
    status: 'completed',
    matchedCases: [],
    durationMs: 1,
    stepsExecuted: 3,
    finalContext: {
      executionId: 'x',
      startedAt: new Date('2026-06-09T00:00:00.000Z'),
      stepResults: new Map<string, unknown>([
        ['query-pn-service', [row({ '@timestamp': '2026-06-09T00:00:00.000Z', '@message': 'boom' })]],
        [
          'query-pn-service-trace',
          [
            row({ '@timestamp': '2026-06-09T00:00:01.000Z', '@message': 'context 1' }),
            row({ '@timestamp': '2026-06-09T00:00:02.000Z', '@message': 'context 2' }),
          ],
        ],
      ]),
      vars,
      params: new Map<string, string>([
        ['alarmName', 'service-alarm'],
        ['alarmDatetime', '2026-06-09T00:00:00.000Z'],
        ['startTime', '2026-06-08T23:55:00.000Z'],
        ['endTime', '2026-06-09T00:05:00.000Z'],
      ]),
      logs: [],
      services: createTestServiceRegistry(),
      recoveredErrors: [],
    },
    recoveredErrors: [],
    trace: {
      execution: {
        executionId: 'x',
        startedAt: '2026-06-09T00:00:00.000Z',
        completedAt: '2026-06-09T00:00:01.000Z',
        durationMs: 1,
        status: 'completed',
        environment: { awsProfiles: [], region: 'eu-south-1', invokedBy: 'manual' },
      },
      input: {},
      pipeline: [],
      caseMatching: { casesEvaluated: 0, matchedCases: [], evaluations: [] },
      earlyResolutions: [],
      actionsExecuted: [],
      summary: { status: 'completed', stepsExecuted: 3, outcome: '', description: '' },
    } as unknown as RunbookExecutionTrace,
  };
}

describe('createServiceAlarmRunbook', () => {
  it('builds the canonical service-log pipeline', () => {
    const runbook = createServiceAlarmRunbook(baseConfig());

    assert.deepStrictEqual(
      runbook.steps.map((descriptor) => descriptor.step.id),
      ['prepare-service-section', 'query-pn-service', 'analyze-pn-service', 'query-pn-service-trace'],
    );
  });

  it('exposes service runbookContext for output builders', () => {
    const runbook = createServiceAlarmRunbook(baseConfig());

    assert.ok(isServiceRunbookContext(runbook.runbookContext));
    assert.strictEqual(runbook.runbookContext.service.name, 'pn-service');
    assert.strictEqual(runbook.runbookContext.queryProfileId, 'send-service');
  });

  it('marks generated service steps as silent', () => {
    const runbook = createServiceAlarmRunbook(baseConfig());

    for (const descriptor of runbook.steps) {
      assert.strictEqual(descriptor.silent, true, `step ${descriptor.step.id} should be silent`);
    }
  });

  it('forwards an explicit asymmetric occurrence window', () => {
    const runbook = createServiceAlarmRunbook(
      baseConfig({ occurrenceTimeWindow: { beforeMinutes: 10, afterMinutes: 5 } }),
    );

    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 10, afterMinutes: 5 });
  });

  it('builds a structured service output context', () => {
    const runbook = createServiceAlarmRunbook(baseConfig());
    const context = buildServiceOutputContext(runbook, fakeResult());

    assert.ok(context !== undefined);
    assert.strictEqual(
      context.fields.find((field) => field.name === 'traceId')?.value,
      '1-abcdef12-1234567890abcdef12345678',
    );
    assert.strictEqual(context.evidence.length, 2);
  });

  it('composes hook evidence once and keeps its retention independent of the family log limit', () => {
    const runbook = createServiceAlarmRunbook(
      baseConfig({
        hooks: ['context', 'missing', 'empty'].map((name) => ({
          at: 'after-service-analysis',
          step: new CloudWatchLogsQueryStep({
            id: `query-${name}`,
            label: name,
            logGroups: ['/aws/ecs/pn-service'],
            query: 'fields @timestamp, @message',
            timeRangeFromParams: { start: 'startTime', end: 'endTime' },
          }),
          evidence: [
            {
              id: name,
              label: `${name} context`,
              type: 'log-sample',
              retention: { mode: 'latest', limit: 2, timestampField: '@timestamp' },
            },
          ],
        })),
      }),
    );
    const baseResult = fakeResult();
    const result = {
      ...baseResult,
      finalContext: {
        ...baseResult.finalContext,
        stepResults: new Map([
          ...baseResult.finalContext.stepResults,
          [
            'query-context',
            [
              row({ '@timestamp': '2026-06-09T00:00:03Z', '@message': 'recovery completed' }),
              row({ '@timestamp': '2026-06-09T00:00:01Z', '@message': 'restart' }),
              row({ '@timestamp': '2026-06-09T00:00:02Z', '@message': 'recovering' }),
            ],
          ],
          ['query-empty', []],
        ]),
      },
    };
    const output = buildRunbookOutput(runbook, result, { contextBuilder: buildServiceOutputContext }).context;
    assert.strictEqual(output.evidence.length, 3);
    assert.deepStrictEqual(output.evidence[2], {
      id: 'context',
      label: 'context context',
      type: 'log-sample',
      sourceStep: 'query-context',
      items: [
        {
          '@timestamp': '2026-06-09T00:00:02Z',
          '@message': 'recovering',
          timestamp: '2026-06-09T00:00:02Z',
          message: 'recovering',
        },
        {
          '@timestamp': '2026-06-09T00:00:03Z',
          '@message': 'recovery completed',
          timestamp: '2026-06-09T00:00:03Z',
          message: 'recovery completed',
        },
      ],
      truncated: true,
    });
    const limited = buildRunbookOutput(runbook, result, {
      contextBuilder: (rb, executionResult) => buildServiceOutputContext(rb, executionResult, { maxRecentLogs: 1 }),
    }).context;
    assert.strictEqual(limited.evidence[2]?.items?.length, 2);
    assert.strictEqual(limited.evidence[2]?.truncated, true);
  });

  for (const matchKnownCase of [false, true]) {
    it(`retains the first extracted trace in the output ${matchKnownCase ? 'on early resolution' : 'and the correlation query'}`, async () => {
      const firstTraceId = '1-6ad86e11-bbc9b685f973172eb4c3377e';
      const laterTraceId = '1-6ad86f35-b3cff4717d51f014d43d8d23';
      const queries: string[] = [];
      const runbook = createServiceAlarmRunbook(
        baseConfig({
          knownCases: matchKnownCase
            ? [
                knownCase({
                  id: 'known-error',
                  description: 'Known application error',
                  priority: 100,
                  condition: {
                    type: 'compare',
                    ref: 'vars.pnServiceErrorMsg',
                    operator: '==',
                    value: 'Exception: latest failure',
                  },
                  resolution: 'Documented resolution.',
                  analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE' },
                }),
              ]
            : [],
        }),
      );
      const result = await new RunbookEngine(new GOLogger()).execute(
        runbook,
        new Map([
          ['startTime', '2026-10-21T07:43:00Z'],
          ['endTime', '2026-10-21T07:58:00Z'],
        ]),
        createTestServiceRegistry({
          cloudWatchLogs: {
            // eslint-disable-next-line @typescript-eslint/require-await
            async queryWithStatistics(_groups: ReadonlyArray<string>, query: string) {
              queries.push(query);
              const rows =
                queries.length === 1
                  ? [
                      row({
                        level: 'ERROR',
                        message: 'Exception: first failure',
                        trace_id: 'batch_id:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
                        '@message': JSON.stringify({ 'AWS-XRAY-TRACE-ID': `${firstTraceId}@0123456789abcdef` }),
                      }),
                      row({ level: 'ERROR', message: 'Exception: latest failure', trace_id: laterTraceId }),
                    ]
                  : [];
              return {
                rows,
                statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
                queryExecutions: [],
              };
            },
          },
        }),
      );

      assert.strictEqual(result.status, 'completed');
      assert.strictEqual(result.finalContext.vars.get('pnServiceTraceId'), firstTraceId);
      assert.strictEqual(result.finalContext.vars.get('pnServiceErrorMsg'), 'Exception: latest failure');
      const output = buildServiceOutputContext(runbook, result);
      assert.strictEqual(output?.fields.find(({ name }) => name === 'traceId')?.value, firstTraceId);
      assert.strictEqual(queries.length, matchKnownCase ? 1 : 2);
      if (matchKnownCase) {
        assert.deepStrictEqual(
          result.matchedCases.map(({ id }) => id),
          ['known-error'],
        );
      } else {
        assert.ok(queries[1]?.includes(firstTraceId));
        assert.ok(!queries[1]?.includes(laterTraceId));
      }
    });
  }

  it('rejects a service.name that is not a slug (would break step ids)', () => {
    assert.throws(
      () =>
        createServiceAlarmRunbook(
          baseConfig({ service: { name: 'pn service', logGroup: '/aws/ecs/pn-service', varPrefix: 'pnService' } }),
        ),
      /service\.name .* must be a slug/,
    );
  });

  it('rejects a service.varPrefix that is not a valid identifier', () => {
    assert.throws(
      () =>
        createServiceAlarmRunbook(
          baseConfig({ service: { name: 'pn-service', logGroup: '/aws/ecs/pn-service', varPrefix: '1bad prefix' } }),
        ),
      /service\.varPrefix/,
    );
  });
});
