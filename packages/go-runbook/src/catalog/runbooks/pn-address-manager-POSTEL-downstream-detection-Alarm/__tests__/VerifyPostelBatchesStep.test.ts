import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  AWSCloudWatchLogsQueryOptions,
  AWSCloudWatchLogsQueryResult,
  AWSCloudWatchLogsTimeRange,
  ResultField,
} from '@go-automation/go-common/aws';
import { GOLogger } from '@go-automation/go-common/core';

import { ConditionEvaluator } from '../../../../core/ConditionEvaluator.js';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { SEND_SERVICE_PROFILE } from '../../../../service/profiles/SEND_SERVICE_PROFILE.js';
import type { RunbookContext } from '../../../../types/RunbookContext.js';
import { buildRunbook } from '../runbook.js';
import { POSTEL_WORKED_BATCH_QUERY, VerifyPostelBatchesStep } from '../VerifyPostelBatchesStep.js';
import { createTestServiceRegistry } from '../../../../services/createTestServiceRegistry.js';

const BATCH_1 = '4e761d4d-5b3d-4c7b-8d77-7f81353b2d5b';
const BATCH_2 = '8a859d33-fb60-47da-a429-879ba7f9c609';

interface QueryCall {
  readonly logGroups: ReadonlyArray<string>;
  readonly query: string;
  readonly timeRange: AWSCloudWatchLogsTimeRange;
  readonly options: AWSCloudWatchLogsQueryOptions | undefined;
}

function row(fields: Readonly<Record<string, string>>): ReadonlyArray<ResultField> {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

function context(
  errorRows: ReadonlyArray<ReadonlyArray<ResultField>>,
  statusRows: ReadonlyArray<ReadonlyArray<ResultField>>,
  calls: QueryCall[],
  params: ReadonlyArray<readonly [string, string]> = [
    ['alarmDatetime', '2026-07-24T12:30:00.000Z'],
    ['alarmDatetimeEnd', '2026-07-24T13:00:00.000Z'],
    ['startTime', '2026-07-24T12:20:00.000Z'],
    ['endTime', '2026-07-24T13:05:00.000Z'],
  ],
): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-07-24T12:00:00.000Z'),
    stepResults: new Map([['query-pn-address-manager', errorRows]]),
    vars: new Map(),
    params: new Map(params),
    logs: [],
    services: createTestServiceRegistry({
      cloudWatchLogs: {
        async queryWithStatistics(
          logGroups: ReadonlyArray<string>,
          query: string,
          timeRange: AWSCloudWatchLogsTimeRange,
          options?: AWSCloudWatchLogsQueryOptions,
        ): Promise<AWSCloudWatchLogsQueryResult> {
          calls.push({ logGroups, query, timeRange, options });
          await Promise.resolve();
          return {
            rows: statusRows,
            statistics: { bytesScanned: 100, recordsScanned: 20, recordsMatched: statusRows.length },
            queryExecutions: [],
          };
        },
      },
    }),
    recoveredErrors: [],
  };
}

function step(): VerifyPostelBatchesStep {
  return new VerifyPostelBatchesStep({
    id: 'verify-postel-batches',
    label: 'Verify POSTEL batches',
    fromStep: 'query-pn-address-manager',
    logGroup: '/aws/ecs/pn-address-manager',
  });
}

describe('VerifyPostelBatchesStep', () => {
  it('uses the canonical SEND service profile in its execution trace', () => {
    const traceInfo = step().getTraceInfo(context([], [], []));

    assert.strictEqual(traceInfo['queryProfileId'], SEND_SERVICE_PROFILE.id);
    assert.strictEqual(traceInfo['queryKind'], 'postel-batch-recovery');
  });

  it('deduplicates impacted batch ids and resolves only when every batch reached WORKED', async () => {
    const calls: QueryCall[] = [];
    const result = await step().execute(
      context(
        [
          row({ trace_id: `batch_id:${BATCH_1}` }),
          row({ trace_id: `batch_id:${BATCH_1}` }),
          row({ trace_id: `batch_id:${BATCH_2}` }),
          row({ trace_id: '6a63111c94aaf72879ec053128003ec0' }),
        ],
        [row({ batchId: BATCH_1 }), row({ batchId: BATCH_2 }), row({ batchId: 'unrelated' })],
        calls,
      ),
    );

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output?.impactedBatchIds, [BATCH_1, BATCH_2]);
    assert.deepStrictEqual(result.output?.workedBatchIds, [BATCH_1, BATCH_2]);
    assert.deepStrictEqual(result.output?.pendingBatchIds, []);
    assert.strictEqual(result.output?.allWorked, true);
    assert.strictEqual(result.vars?.['postelAllBatchesWorked'], 'true');
    assert.strictEqual(result.vars?.['postelImpactedBatchCount'], '2');
    assert.strictEqual(result.next, 'resolve');

    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0]?.logGroups, ['/aws/ecs/pn-address-manager']);
    assert.strictEqual(calls[0]?.query, POSTEL_WORKED_BATCH_QUERY);
    assert.strictEqual(calls[0]?.timeRange.start.toISOString(), '2026-07-24T12:20:00.000Z');
    assert.strictEqual(calls[0]?.timeRange.end.toISOString(), '2026-07-24T15:00:00.000Z');
    assert.deepStrictEqual(calls[0]?.options, {
      logGroupResolutionMode: 'search-configured-profiles',
      paginateResults: true,
    });
  });

  it('covers the observed POSTEL recovery outliers with two hours after a single occurrence', async () => {
    const calls: QueryCall[] = [];
    const result = await step().execute(
      context([row({ trace_id: `batch_id:${BATCH_1}` })], [row({ batchId: BATCH_1 })], calls, [
        ['alarmDatetime', '2026-06-24T08:26:08.349Z'],
        ['startTime', '2026-06-24T08:16:08.349Z'],
        ['endTime', '2026-06-24T08:31:08.349Z'],
      ]),
    );

    assert.strictEqual(calls[0]?.timeRange.end.toISOString(), '2026-06-24T10:26:08.349Z');
    assert.strictEqual(result.vars?.['postelRecoveryAfterMinutes'], '120');
    assert.strictEqual(result.output?.allWorked, true);
  });

  it('reports pending batches and does not resolve when WORKED evidence is incomplete', async () => {
    const calls: QueryCall[] = [];
    const result = await step().execute(
      context(
        [row({ trace_id: `batch_id:${BATCH_1}` }), row({ trace_id: `batch_id:${BATCH_2}` })],
        [row({ batchId: BATCH_1 })],
        calls,
      ),
    );

    assert.strictEqual(result.output?.allWorked, false);
    assert.deepStrictEqual(result.output?.pendingBatchIds, [BATCH_2]);
    assert.strictEqual(result.vars?.['postelPendingBatchCount'], '1');
    assert.strictEqual(result.vars?.['postelAllBatchesWorked'], 'false');
  });

  it('skips the recovery query when no batch_id trace is available', async () => {
    const calls: QueryCall[] = [];
    const result = await step().execute(context([row({ trace_id: '6a63111c94aaf72879ec053128003ec0' })], [], calls));

    assert.deepStrictEqual(calls, []);
    assert.deepStrictEqual(result.output?.impactedBatchIds, []);
    assert.strictEqual(result.vars?.['postelAllBatchesWorked'], 'false');
    assert.strictEqual(result.vars?.['postelPendingBatchIds'], 'nessuno');
  });

  it('resolves the complete runbook at the recovery step when all impacted batches are WORKED', async () => {
    const queries: string[] = [];
    const errorMessage = '[DOWNSTREAM] Service POSTEL returned errors=503 Service Unavailable';
    const services = createTestServiceRegistry({
      cloudWatchLogs: {
        async queryWithStatistics(
          _logGroups: ReadonlyArray<string>,
          query: string,
          _timeRange: AWSCloudWatchLogsTimeRange,
          _options?: AWSCloudWatchLogsQueryOptions,
        ): Promise<AWSCloudWatchLogsQueryResult> {
          queries.push(query);
          await Promise.resolve();
          const rows =
            query === POSTEL_WORKED_BATCH_QUERY
              ? [row({ batchId: BATCH_1 })]
              : [
                  row({
                    level: 'ERROR',
                    trace_id: `batch_id:${BATCH_1}`,
                    message: errorMessage,
                    '@message': errorMessage,
                  }),
                ];
          return {
            rows,
            statistics: { bytesScanned: 100, recordsScanned: 20, recordsMatched: rows.length },
            queryExecutions: [],
          };
        },
      },
    });

    const result = await new RunbookEngine(new GOLogger(), new ConditionEvaluator()).execute(
      buildRunbook(),
      new Map([
        ['alarmName', 'pn-address-manager-POSTEL-downstream-detection-Alarm'],
        ['alarmDatetime', '2026-07-24T12:30:00.000Z'],
        ['alarmDatetimeEnd', '2026-07-24T13:00:00.000Z'],
        ['startTime', '2026-07-24T12:20:00.000Z'],
        ['endTime', '2026-07-24T13:05:00.000Z'],
      ]),
      services,
    );

    assert.strictEqual(result.status, 'completed');
    assert.deepStrictEqual(
      result.matchedCases.map(({ id }) => id),
      ['postel-all-batches-worked-after-retry'],
    );
    assert.strictEqual(result.earlyResolution, true);
    assert.strictEqual(result.resolvedAtStep, 'verify-postel-batches');
    assert.deepStrictEqual(
      result.trace.pipeline.map(({ stepId }) => stepId),
      ['prepare-service-section', 'query-pn-address-manager', 'analyze-pn-address-manager', 'verify-postel-batches'],
    );
    assert.strictEqual(queries.length, 2);
  });
});
