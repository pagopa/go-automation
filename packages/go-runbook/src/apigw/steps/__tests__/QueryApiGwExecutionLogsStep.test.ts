import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import type { AWSCloudWatchLogsQueryOptions, ResultField } from '@go-automation/go-common/aws';
import type { GOLogger } from '@go-automation/go-common/core';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { Step } from '../../../types/Step.js';
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';
import type { CloudWatchLogsQueryService } from '../../../services/CloudWatchLogsQueryService.js';
import type { TimeRange } from '../../../types/TimeRange.js';

import { queryApiGwExecutionLogs } from '../QueryApiGwExecutionLogsStep.js';

interface CapturedCall {
  readonly logGroups: ReadonlyArray<string>;
  readonly query: string;
  readonly timeRange: TimeRange;
  readonly options?: AWSCloudWatchLogsQueryOptions;
}

function createFakeCwLogs(results: ReadonlyArray<ReadonlyArray<ResultField>> = []): {
  service: CloudWatchLogsQueryService;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  const service = {
    query: mock.fn(
      async (
        logGroups: ReadonlyArray<string>,
        query: string,
        timeRange: TimeRange,
        options?: AWSCloudWatchLogsQueryOptions,
      ): Promise<ReadonlyArray<ReadonlyArray<ResultField>>> => {
        await Promise.resolve();
        calls.push({
          logGroups: [...logGroups],
          query,
          timeRange,
          ...(options !== undefined ? { options } : {}),
        });
        return results;
      },
    ),
  } as unknown as CloudWatchLogsQueryService;
  return { service, calls };
}

function createContext(args: {
  readonly stepOutput: ReadonlyArray<ReadonlyArray<ResultField>>;
  readonly cloudWatchLogs: CloudWatchLogsQueryService;
  readonly logger?: GOLogger;
}): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map<string, unknown>([['query-api-gw-logs', args.stepOutput]]),
    vars: new Map(),
    params: new Map<string, string>([
      ['startTime', '2026-01-01T00:00:00.000Z'],
      ['endTime', '2026-01-01T00:10:00.000Z'],
    ]),
    logs: [],
    services: { cloudWatchLogs: args.cloudWatchLogs } as unknown as ServiceRegistry,
    recoveredErrors: [],
    ...(args.logger !== undefined ? { logger: args.logger } : {}),
  };
}

function buildRow(fields: Record<string, string>): ResultField[] {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

function captureLogger(): { logger: GOLogger; lines: string[] } {
  const lines: string[] = [];
  const logger = {
    text: (message: string) => lines.push(message),
    newline: () => lines.push(''),
  } as unknown as GOLogger;
  return { logger, lines };
}

function createStep(
  args: { readonly maxRequestIdsOverride?: number } = {},
): Step<ReadonlyArray<ReadonlyArray<ResultField>>> {
  return queryApiGwExecutionLogs({
    id: 'query-execution-logs',
    label: 'Query execution logs',
    fromStep: 'query-api-gw-logs',
    executionLogGroup: 'API-Gateway-Execution-Logs_test/prod',
    timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    ...(args.maxRequestIdsOverride !== undefined ? { maxRequestIdsOverride: args.maxRequestIdsOverride } : {}),
  });
}

describe('queryApiGwExecutionLogs', () => {
  it('skips the CloudWatch query when no access-log row has an API Gateway errorMessage', async () => {
    const { service, calls } = createFakeCwLogs();
    const step = createStep();
    const result = await step.execute(
      createContext({
        cloudWatchLogs: service,
        stepOutput: [
          buildRow({ status: '500', errorMessage: '-' }),
          buildRow({ status: '200', errorMessage: 'Internal server error', requestId: 'req-ignored' }),
        ],
      }),
    );

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, []);
    assert.strictEqual(result.vars?.['apiGwExecutionLogMode'], 'skipped');
    assert.strictEqual(result.vars?.['apiGwExecutionLogRequestCount'], '0');
    assert.strictEqual(result.vars?.['apiGwExecutionLogCount'], '0');
    assert.strictEqual(calls.length, 0);
  });

  it('skips execution-log analysis as not-configured when executionLogGroup is missing', async () => {
    const { service, calls } = createFakeCwLogs();
    const step = queryApiGwExecutionLogs({
      id: 'query-execution-logs',
      label: 'Query execution logs',
      fromStep: 'query-api-gw-logs',
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    });

    const result = await step.execute(
      createContext({
        cloudWatchLogs: service,
        stepOutput: [
          buildRow({ status: '500', errorMessage: 'Internal server error', requestId: 'req-1', path: '/foo' }),
        ],
      }),
    );

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, []);
    assert.strictEqual(result.vars?.['apiGwExecutionLogMode'], 'not-configured');
    assert.strictEqual(result.vars?.['apiGwExecutionLogRequestCount'], '0');
    assert.strictEqual(result.vars?.['apiGwExecutionLogCount'], '0');
    assert.strictEqual(result.next, undefined);
    assert.strictEqual(calls.length, 0);
  });

  it('extracts requestIds, renders one OR-combined query and enriches execution-log rows', async () => {
    const { logger, lines } = captureLogger();
    const { service, calls } = createFakeCwLogs([
      [buildField('@message', 'Execution failed for req-1')],
      [buildField('@message', 'Execution failed for req-2')],
      [buildField('@message', 'Execution failed without a matched request id')],
    ]);
    const step = createStep();

    const result = await step.execute(
      createContext({
        cloudWatchLogs: service,
        logger,
        stepOutput: [
          buildRow({ status: '500', errorMessage: 'Internal server error', requestId: 'req-1', path: '/foo' }),
          buildRow({ status: '503', errorMessage: 'Bad gateway', requestId: 'req-2', path: '/bar' }),
        ],
      }),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(calls.length, 1);
    const call = calls[0];
    assert.ok(call !== undefined);
    assert.deepStrictEqual(call.logGroups, ['API-Gateway-Execution-Logs_test/prod']);
    assert.match(call.query, /filter \(@message like 'req-1'\) or \(@message like 'req-2'\)/);
    assert.match(call.query, /\| display @timestamp, @message/);
    assert.strictEqual(call.timeRange.start.toISOString(), '2026-01-01T00:00:00.000Z');
    assert.strictEqual(call.timeRange.end.toISOString(), '2026-01-01T00:10:00.000Z');
    assert.strictEqual(call.options?.logGroupResolutionMode, 'search-configured-profiles');

    assert.strictEqual(result.vars?.['apiGwExecutionLogMode'], 'queried');
    assert.strictEqual(result.vars?.['apiGwExecutionLogRequestCount'], '2');
    assert.strictEqual(result.vars?.['apiGwExecutionLogRequestIds'], 'req-1,req-2');
    assert.strictEqual(result.vars?.['apiGwExecutionLogPaths'], '/foo,/bar');
    assert.strictEqual(result.vars?.['apiGwExecutionLogCount'], '3');
    assert.strictEqual(result.next, 'resolve');
    const joined = lines.join('\n');
    assert.match(joined, /Verifica execution log API Gateway/);
    assert.match(joined, /Errori HTTP individuati: 2 \(status 500\)/);
    assert.match(joined, /query execution log/);

    const output = result.output;
    assert.ok(output !== undefined);
    assert.deepStrictEqual(output[0]?.slice(-2), [buildField('requestId', 'req-1'), buildField('path', '/foo')]);
    assert.deepStrictEqual(output[1]?.slice(-2), [buildField('requestId', 'req-2'), buildField('path', '/bar')]);
    assert.deepStrictEqual(output[2]?.slice(-2), [buildField('requestId', ''), buildField('path', '')]);
  });

  it('keeps distinct requestIds that share the same path', async () => {
    const { service, calls } = createFakeCwLogs([
      [buildField('@message', 'Execution failed for req-1')],
      [buildField('@message', 'Execution failed for req-2')],
    ]);
    const step = createStep();

    const result = await step.execute(
      createContext({
        cloudWatchLogs: service,
        stepOutput: [
          buildRow({ status: '500', errorMessage: 'Internal server error', requestId: 'req-1', path: '/same' }),
          buildRow({ status: '503', errorMessage: 'Bad gateway', requestId: 'req-2', path: '/same' }),
          buildRow({ status: '502', errorMessage: 'Duplicate retry', requestId: 'req-1', path: '/same' }),
        ],
      }),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(calls.length, 1);
    const call = calls[0];
    assert.ok(call !== undefined);
    assert.match(call.query, /filter \(@message like 'req-1'\) or \(@message like 'req-2'\)/);
    assert.strictEqual(call.query.match(/req-1/g)?.length, 1);
    assert.strictEqual(call.query.match(/req-2/g)?.length, 1);
    assert.strictEqual(result.vars?.['apiGwExecutionLogRequestCount'], '2');
    assert.strictEqual(result.vars?.['apiGwExecutionLogRequestIds'], 'req-1,req-2');
    assert.strictEqual(result.vars?.['apiGwExecutionLogPaths'], '/same,/same');

    const output = result.output;
    assert.ok(output !== undefined);
    assert.deepStrictEqual(output[0]?.slice(-2), [buildField('requestId', 'req-1'), buildField('path', '/same')]);
    assert.deepStrictEqual(output[1]?.slice(-2), [buildField('requestId', 'req-2'), buildField('path', '/same')]);
  });

  it('fails fast when the extracted requestIds exceed the configured limit', async () => {
    const { service, calls } = createFakeCwLogs();
    const step = createStep({ maxRequestIdsOverride: 1 });

    const result = await step.execute(
      createContext({
        cloudWatchLogs: service,
        stepOutput: [
          buildRow({ status: '500', errorMessage: 'Internal server error', requestId: 'req-1', path: '/foo' }),
          buildRow({ status: '503', errorMessage: 'Bad gateway', requestId: 'req-2', path: '/bar' }),
        ],
      }),
    );

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /would combine 2 requestId predicates/);
    assert.match(result.error ?? '', /over the limit of 1/);
    assert.strictEqual(calls.length, 0);
  });

  it('continues without early resolution when no requestId can be extracted', async () => {
    const { service, calls } = createFakeCwLogs();
    const step = createStep();

    const result = await step.execute(
      createContext({
        cloudWatchLogs: service,
        stepOutput: [buildRow({ status: '500', errorMessage: 'Internal server error', requestId: '-', path: '/foo' })],
      }),
    );

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, []);
    assert.strictEqual(result.vars?.['apiGwExecutionLogMode'], 'no-request-id');
    assert.strictEqual(result.vars?.['apiGwErrorCount'], '1');
    assert.strictEqual(result.vars?.['apiGwStatusCode'], '500');
    assert.strictEqual(result.vars?.['apiGwExecutionLogRequestCount'], '0');
    assert.strictEqual(result.vars?.['apiGwExecutionLogRequestIds'], '');
    assert.strictEqual(result.vars?.['apiGwExecutionLogPaths'], '');
    assert.strictEqual(result.vars?.['terminationReason'], undefined);
    assert.strictEqual(result.vars?.['lastErrorMsg'], undefined);
    assert.strictEqual(result.next, undefined);
    assert.strictEqual(calls.length, 0);
  });
});

function buildField(field: string, value: string): ResultField {
  return { field, value };
}
