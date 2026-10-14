import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AWSCloudWatchLogsQueryOptions, ResultField } from '@go-automation/go-common/aws';

import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import type { RunbookContext } from '../../framework.js';
import { NOTIFICATION_SCHEDULER_ALARM as alarm } from '../alarmDefinition.js';
import { QueryNotificationSchedulerContextStep } from '../QueryNotificationSchedulerContextStep.js';

interface QueryCall {
  readonly groups: ReadonlyArray<string>;
  readonly query: string;
  readonly timeRange: { readonly start: Date; readonly end: Date };
  readonly options: AWSCloudWatchLogsQueryOptions;
}

const LOG_GROUP = '/aws/eks/interop-eks-cluster-prod/application';
const RESOLVED_VARS = [
  ['interopLogGroup', LOG_GROUP],
  ['interopPodApp', alarm.podApp],
] as const;

function context(
  vars: ReadonlyArray<readonly [string, string]>,
  calls: QueryCall[],
  rowCount = 1,
  queryError?: Error,
): RunbookContext {
  return {
    executionId: 'notification-scheduler-context-test',
    startedAt: new Date('2026-10-10T00:11:59Z'),
    stepResults: new Map(),
    vars: new Map(vars),
    params: new Map([
      ['startTime', '2026-10-10T00:06:59Z'],
      ['endTime', '2026-10-10T00:16:59Z'],
    ]),
    logs: [],
    services: createTestServiceRegistry({
      cloudWatchLogs: {
        // eslint-disable-next-line @typescript-eslint/require-await
        async queryWithStatistics(
          groups: ReadonlyArray<string>,
          query: string,
          timeRange: { start: Date; end: Date },
          options: AWSCloudWatchLogsQueryOptions,
        ) {
          calls.push({ groups, query, timeRange, options });
          if (queryError !== undefined) throw queryError;
          const rows: ReadonlyArray<ReadonlyArray<ResultField>> = Array.from({ length: rowCount }, () => [
            { field: 'pod_app', value: alarm.podApp },
            { field: 'log', value: 'INFO - AWS authentication token obtained' },
          ]);
          return {
            rows,
            statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
            queryExecutions: [],
          };
        },
      },
    }),
    recoveredErrors: [],
  };
}

describe('QueryNotificationSchedulerContextStep', () => {
  it('reads all scheduler log levels without a CID and forwards the execution signal', async () => {
    const calls: QueryCall[] = [];
    const signal = new AbortController().signal;
    const input = { ...context(RESOLVED_VARS, calls), signal };
    const step = new QueryNotificationSchedulerContextStep();

    const result = await step.execute(input);

    assert.strictEqual(result.success, true);
    assert.strictEqual(calls.length, 1);
    const [call] = calls;
    assert.ok(call !== undefined);
    assert.deepStrictEqual(call.groups, [LOG_GROUP]);
    assert.ok(call.query.includes(`filter pod_app = "${alarm.podApp}"`));
    assert.ok(call.query.includes('filter @logStream not like /adot-collector/'));
    assert.doesNotMatch(call.query, /ERROR|\bcid\b/i);
    assert.deepStrictEqual(call.options, {
      signal,
      logGroupResolutionMode: 'search-configured-profiles',
      paginateResults: true,
    });
    assert.deepStrictEqual(call.timeRange, {
      start: new Date('2026-10-10T00:06:59Z'),
      end: new Date('2026-10-10T00:16:59Z'),
    });
    assert.strictEqual(result.output?.length, 1);
    assert.deepStrictEqual(result.vars, { notificationSchedulerContextLogCount: '1' });
    assert.strictEqual(result.diagnostics?.cloudWatchLogs?.rowsReturned, 1);
    assert.deepStrictEqual(step.getTraceInfo(input), { logGroup: LOG_GROUP, podApp: alarm.podApp, levels: 'ALL' });
  });

  it('escapes the pod app so its value cannot broaden the service filter', async () => {
    const calls: QueryCall[] = [];
    const result = await new QueryNotificationSchedulerContextStep().execute(
      context(
        [
          ['interopLogGroup', LOG_GROUP],
          ['interopPodApp', 'scheduler" or pod_app like /.*/ or "'],
        ],
        calls,
      ),
    );

    assert.strictEqual(result.success, true);
    assert.ok(calls[0]?.query.includes('filter pod_app = "scheduler\\" or pod_app like /.*/ or \\""'));
  });

  it('identifies the missing scheduler context and does not query AWS', async () => {
    for (const vars of [[RESOLVED_VARS[0]], [RESOLVED_VARS[1]], []] as const) {
      const calls: QueryCall[] = [];
      const result = await new QueryNotificationSchedulerContextStep().execute(context(vars, calls));

      assert.strictEqual(result.success, false);
      assert.match(result.error ?? '', /Missing resolved INTEROP notification scheduler context/);
      assert.doesNotMatch(result.error ?? '', /writer/);
      assert.deepStrictEqual(calls, []);
    }
  });

  it('accepts an empty result and reports zero context logs', async () => {
    const result = await new QueryNotificationSchedulerContextStep().execute(context(RESOLVED_VARS, [], 0));

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, []);
    assert.deepStrictEqual(result.vars, { notificationSchedulerContextLogCount: '0' });
  });

  it('accepts 999 rows but rejects a result saturated at the 1000-row limit', async () => {
    const complete = await new QueryNotificationSchedulerContextStep().execute(context(RESOLVED_VARS, [], 999));
    assert.strictEqual(complete.success, true);
    assert.strictEqual(complete.output?.length, 999);

    const saturated = await new QueryNotificationSchedulerContextStep().execute(context(RESOLVED_VARS, [], 1000));
    assert.strictEqual(saturated.success, false);
    assert.match(saturated.error ?? '', /Scheduler context reached 1000 rows/);
    assert.strictEqual(saturated.output, undefined);
    assert.strictEqual(saturated.vars, undefined);
  });

  it('reports a failed AWS query without returning context evidence', async () => {
    const result = await new QueryNotificationSchedulerContextStep().execute(
      context(RESOLVED_VARS, [], 1, new Error('AccessDenied')),
    );

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /Notification scheduler context failed: AccessDenied/);
    assert.strictEqual(result.output, undefined);
    assert.strictEqual(result.vars, undefined);
  });
});
