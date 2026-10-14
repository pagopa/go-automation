import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ResultField } from '@go-automation/go-common/aws';

import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import type { RunbookContext } from '../../framework.js';
import { CATALOG_PLATFORMSTATE_WRITER_ALARM as alarm } from '../alarmDefinition.js';
import { QueryWriterContextStep } from '../QueryWriterContextStep.js';

interface QueryCall {
  readonly groups: ReadonlyArray<string>;
  readonly query: string;
  readonly timeRange: { readonly start: Date; readonly end: Date };
  readonly options: { readonly logGroupResolutionMode?: string; readonly paginateResults?: boolean };
}

const LOG_GROUP = '/aws/eks/interop-eks-cluster-prod/application';

function context(vars: ReadonlyArray<readonly [string, string]>, calls: QueryCall[], rowCount = 1): RunbookContext {
  return {
    executionId: 'platformstate-writer-context-test',
    startedAt: new Date('2026-10-06T18:05:00.000Z'),
    stepResults: new Map(),
    vars: new Map(vars),
    params: new Map([
      ['startTime', '2026-10-06T17:30:00Z'],
      ['endTime', '2026-10-06T18:05:00Z'],
    ]),
    logs: [],
    services: createTestServiceRegistry({
      cloudWatchLogs: {
        // eslint-disable-next-line @typescript-eslint/require-await
        async queryWithStatistics(
          groups: ReadonlyArray<string>,
          query: string,
          timeRange: { start: Date; end: Date },
          options: { logGroupResolutionMode?: string; paginateResults?: boolean },
        ) {
          calls.push({ groups, query, timeRange, options });
          const rows: ReadonlyArray<ReadonlyArray<ResultField>> = Array.from({ length: rowCount }, () => [
            { field: 'pod_app', value: alarm.podApp },
            { field: 'log', value: 'INFO - Consumer subscribed topic event-store.prod_catalog.events' },
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

const RESOLVED_VARS = [
  ['interopLogGroup', LOG_GROUP],
  ['interopPodApp', alarm.podApp],
] as const;

describe('QueryWriterContextStep', () => {
  it('reads every log level of the resolved writer pod without requiring a CID', async () => {
    const calls: QueryCall[] = [];
    const input = context(RESOLVED_VARS, calls);
    const step = new QueryWriterContextStep();

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
      logGroupResolutionMode: 'search-configured-profiles',
      paginateResults: true,
    });
    assert.deepStrictEqual(call.timeRange, {
      start: new Date('2026-10-06T17:30:00Z'),
      end: new Date('2026-10-06T18:05:00Z'),
    });
    assert.strictEqual(result.output?.length, 1);
    assert.deepStrictEqual(result.vars, { platformstateWriterContextLogCount: '1' });
    assert.strictEqual(result.diagnostics?.cloudWatchLogs?.rowsReturned, 1);
    assert.deepStrictEqual(step.getTraceInfo(input), { logGroup: LOG_GROUP, podApp: alarm.podApp, levels: 'ALL' });
  });

  it('escapes the pod app before embedding it in the query', async () => {
    const calls: QueryCall[] = [];
    await new QueryWriterContextStep().execute(
      context(
        [
          ['interopLogGroup', LOG_GROUP],
          ['interopPodApp', 'writer" or pod_app like /.*/ or "'],
        ],
        calls,
      ),
    );

    assert.ok(calls[0]?.query.includes('filter pod_app = "writer\\" or pod_app like /.*/ or \\""'));
  });

  it('fails before querying when the INTEROP writer context was not resolved', async () => {
    for (const vars of [[RESOLVED_VARS[0]], [RESOLVED_VARS[1]], []] as const) {
      const calls: QueryCall[] = [];
      const result = await new QueryWriterContextStep().execute(context(vars, calls));

      assert.strictEqual(result.success, false);
      assert.match(result.error ?? '', /Missing resolved INTEROP writer context/);
      assert.deepStrictEqual(calls, []);
    }
  });

  it('fails instead of returning a context truncated at 1000 rows', async () => {
    const result = await new QueryWriterContextStep().execute(context(RESOLVED_VARS, [], 1000));

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /reached 1000 rows/);
  });
});
