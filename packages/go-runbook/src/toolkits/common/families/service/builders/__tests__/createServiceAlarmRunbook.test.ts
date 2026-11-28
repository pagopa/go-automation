import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOLogger } from '@pagopa/go-common/logging';

import { CloudWatchLogsQueryStep } from '../../../../steps/aws/cloudwatch-logs/CloudWatchLogsQueryStep.js';
import { buildRunbookOutput } from '../../../../output/buildRunbookOutput.js';
import { RunbookEngine } from '../../../../../../engine/core/RunbookEngine.js';
import { knownError } from '../../../../analysis/knownError.js';
import { createServiceAlarmRunbook } from '../createServiceAlarmRunbook.js';
import type { ServiceAlarmConfig } from '../../types/ServiceAlarmConfig.js';
import { buildServiceOutputContext } from '../../output/buildServiceOutputContext.js';
import type { RunbookExecutionResult } from '../../../../../../engine/types/RunbookExecutionResult.js';
import { createTestServiceRegistry } from '../../../../testing/createTestServiceRegistry.js';
import { SEND_SERVICE_PROFILE } from '../../../../../send/families/service/profiles/SEND_SERVICE_PROFILE.js';
import { createTestExecutionResult } from '../../../../../../__tests__/helpers/createTestExecutionResult.js';
import { logRow } from '../../../../../../__tests__/helpers/logRow.js';
import { TEST_RUNBOOK_METADATA } from '../../../../../../__tests__/helpers/TEST_RUNBOOK_METADATA.js';

function baseConfig(overrides: Partial<ServiceAlarmConfig> = {}): ServiceAlarmConfig {
  return {
    id: 'service-alarm',
    metadata: TEST_RUNBOOK_METADATA,
    queryProfile: SEND_SERVICE_PROFILE,
    product: 'SEND',
    service: { name: 'pn-service', logGroup: '/aws/ecs/pn-service', varPrefix: 'pnService' },
    knownErrors: [],
    ...overrides,
  };
}

/** A finished execution of the service pipeline, plus the outputs of `stepResults`. */
function fakeResult(stepResults: Readonly<Record<string, unknown>> = {}): RunbookExecutionResult {
  return createTestExecutionResult({
    vars: {
      pnServiceLogCount: '1',
      pnServiceTraceId: '1-abcdef12-1234567890abcdef12345678',
      pnServiceTraceLogCount: '2',
      pnServiceErrorMsg: 'boom',
    },
    params: {
      alarmName: 'service-alarm',
      alarmDatetime: '2026-06-09T00:00:00.000Z',
      startTime: '2026-06-08T23:55:00.000Z',
      endTime: '2026-06-09T00:05:00.000Z',
    },
    stepResults: {
      'query-pn-service': [logRow({ '@timestamp': '2026-06-09T00:00:00.000Z', '@message': 'boom' })],
      'query-pn-service-trace': [
        logRow({ '@timestamp': '2026-06-09T00:00:01.000Z', '@message': 'context 1' }),
        logRow({ '@timestamp': '2026-06-09T00:00:02.000Z', '@message': 'context 2' }),
      ],
      ...stepResults,
    },
  });
}

describe('createServiceAlarmRunbook', () => {
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
          at: 'after-service-scan',
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
    const result = fakeResult({
      'query-context': [
        logRow({ '@timestamp': '2026-06-09T00:00:03Z', '@message': 'recovery completed' }),
        logRow({ '@timestamp': '2026-06-09T00:00:01Z', '@message': 'restart' }),
        logRow({ '@timestamp': '2026-06-09T00:00:02Z', '@message': 'recovering' }),
      ],
      'query-empty': [],
    });
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

  for (const matchKnownError of [false, true]) {
    it(`retains the first extracted trace in the output and the correlation query ${matchKnownError ? 'with' : 'without'} a known error`, async () => {
      const firstTraceId = '1-6ad86e11-bbc9b685f973172eb4c3377e';
      const laterTraceId = '1-6ad86f35-b3cff4717d51f014d43d8d23';
      const queries: string[] = [];
      const runbook = createServiceAlarmRunbook(
        baseConfig({
          knownErrors: matchKnownError
            ? [
                knownError({
                  code: 'known-error',
                  description: 'Known application error',
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
                      logRow({
                        level: 'ERROR',
                        message: 'Exception: first failure',
                        trace_id: 'batch_id:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
                        '@message': JSON.stringify({ 'AWS-XRAY-TRACE-ID': `${firstTraceId}@0123456789abcdef` }),
                      }),
                      logRow({ level: 'ERROR', message: 'Exception: latest failure', trace_id: laterTraceId }),
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

      // Each error row is a node with its own trace; both traces are read with one grouped query.
      assert.strictEqual(result.status, 'completed');
      assert.deepStrictEqual(
        result.tree?.filter((node) => node.parentId === undefined).map((node) => node.correlation['traceId']),
        [firstTraceId, laterTraceId],
      );
      const output = buildServiceOutputContext(runbook, result);
      // The output represents the first chain: the recognized error when there is one.
      assert.strictEqual(
        output?.fields.find(({ name }) => name === 'traceId')?.value,
        matchKnownError ? laterTraceId : firstTraceId,
      );
      assert.strictEqual(queries.length, 2);
      assert.ok(queries[1]?.includes(firstTraceId) === true && queries[1].includes(laterTraceId));
      assert.deepStrictEqual(
        result.detections.map(({ knownError }) => knownError.code),
        matchKnownError ? ['known-error'] : [],
      );
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
