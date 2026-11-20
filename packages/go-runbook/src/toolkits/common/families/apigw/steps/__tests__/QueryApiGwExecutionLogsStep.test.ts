import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AWSCloudWatchLogsQueryOptions } from '@pagopa/go-aws/cloudwatch-logs';
import { type GOLogsInsightsResultField, readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import type { RunbookReporter } from '../../../../../../engine/reporting/RunbookReporter.js';
import type { TimeRange } from '../../../../time/TimeRange.js';

import { QueryApiGwExecutionLogsStep } from '../QueryApiGwExecutionLogsStep.js';
import type { QueryApiGwExecutionLogsConfig } from '../QueryApiGwExecutionLogsStep.js';
import { SEND_API_GW_PROFILE } from '../../../../../send/families/apigw/profiles/SEND_API_GW_PROFILE.js';
import type { OperationalContext } from '../../../../services/OperationalContext.js';
import { captureNarrative } from '../../../../../../__tests__/helpers/captureNarrative.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';
import { logRow } from '../../../../../../__tests__/helpers/logRow.js';

type Rows = ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;

interface CapturedCall {
  readonly logGroups: ReadonlyArray<string>;
  readonly query: string;
  readonly timeRange: TimeRange;
  readonly options?: AWSCloudWatchLogsQueryOptions;
}

/** CloudWatch Logs stub recording each query and answering with `results`, or failing with `error`. */
function createFakeCwLogs(results: Rows = [], error?: Error): { service: unknown; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const service = {
    async query(
      logGroups: ReadonlyArray<string>,
      query: string,
      timeRange: TimeRange,
      options?: AWSCloudWatchLogsQueryOptions,
    ): Promise<Rows> {
      await Promise.resolve();
      calls.push({ logGroups: [...logGroups], query, timeRange, ...(options !== undefined ? { options } : {}) });
      if (error !== undefined) throw error;
      return results;
    },
  };
  return { service, calls };
}

function createContext(args: {
  readonly stepOutput: Rows;
  readonly cloudWatchLogs: unknown;
  readonly reporter?: RunbookReporter;
  readonly vars?: Readonly<Record<string, string>>;
}): OperationalContext {
  return createTestContext({
    stepResults: { 'query-api-gw-logs': args.stepOutput },
    ...(args.vars !== undefined ? { vars: args.vars } : {}),
    params: { startTime: '2026-01-01T00:00:00.000Z', endTime: '2026-01-01T00:10:00.000Z' },
    services: {
      cloudWatchLogs: args.cloudWatchLogs,
      ...(args.reporter !== undefined ? { reporter: args.reporter } : {}),
    },
  });
}

/** The step with the SEND profile (the step has no product default). */
function createStep(
  overrides: Partial<Pick<QueryApiGwExecutionLogsConfig, 'maxRequestIdsOverride'>> & {
    readonly executionLogGroup?: string | null;
  } = {},
): QueryApiGwExecutionLogsStep {
  const { executionLogGroup = 'API-Gateway-Execution-Logs_test/prod', ...rest } = overrides;
  const executionLog = SEND_API_GW_PROFILE.executionLog;
  if (executionLog === undefined) throw new Error('SEND_API_GW_PROFILE declares an execution log');
  return new QueryApiGwExecutionLogsStep({
    spec: executionLog,
    accessLogSchema: SEND_API_GW_PROFILE.accessLog.schema,
    queryProfileId: SEND_API_GW_PROFILE.id,
    id: 'query-execution-logs',
    label: 'Query execution logs',
    fromStep: 'query-api-gw-logs',
    timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    ...(executionLogGroup === null ? {} : { executionLogGroup }),
    ...rest,
  });
}

describe('queryApiGwExecutionLogs', () => {
  it('skips the CloudWatch query when no access-log row is a request in error', async () => {
    const { service, calls } = createFakeCwLogs();
    const step = createStep();
    const result = await step.execute(
      createContext({
        cloudWatchLogs: service,
        stepOutput: [logRow({ status: '200', errorMessage: 'Internal server error', requestId: 'req-ignored' })],
      }),
    );

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, []);
    assert.strictEqual(result.vars?.['apiGwExecutionLogMode'], 'skipped');
    assert.strictEqual(result.vars?.['apiGwExecutionLogRequestCount'], '0');
    assert.strictEqual(result.vars?.['apiGwExecutionLogCount'], '0');
    assert.strictEqual(calls.length, 0);
  });

  it('looks up every request in error with a request id, whatever its errorMessage', async () => {
    const { service, calls } = createFakeCwLogs();
    const result = await createStep().execute(
      createContext({
        cloudWatchLogs: service,
        stepOutput: [logRow({ status: '500', errorMessage: '-', requestId: 'req-1', path: '/foo' })],
      }),
    );

    assert.strictEqual(result.vars?.['apiGwExecutionLogMode'], 'queried');
    assert.strictEqual(result.vars?.['apiGwExecutionLogRequestIds'], 'req-1');
    assert.strictEqual(calls.length, 1);
  });

  it('skips execution-log analysis as not-configured when executionLogGroup is missing', async () => {
    const { service, calls } = createFakeCwLogs();
    const step = createStep({ executionLogGroup: null });

    const result = await step.execute(
      createContext({
        cloudWatchLogs: service,
        stepOutput: [
          logRow({ status: '500', errorMessage: 'Internal server error', requestId: 'req-1', path: '/foo' }),
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
    const { reporter, lines } = captureNarrative();
    const { service, calls } = createFakeCwLogs([
      logRow({ '@message': '(req-1) Execution failed' }),
      logRow({ '@message': '(req-2) Execution failed' }),
      logRow({ '@message': 'Execution failed without a matched request id' }),
    ]);
    const step = createStep();

    const result = await step.execute(
      createContext({
        cloudWatchLogs: service,
        reporter,
        stepOutput: [
          logRow({ status: '500', errorMessage: 'Internal server error', requestId: 'req-1', path: '/foo' }),
          logRow({ status: '503', errorMessage: 'Bad gateway', requestId: 'req-2', path: '/bar' }),
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
    // A line without its leading request id has no verifiable owner: it is left out.
    assert.strictEqual(result.vars?.['apiGwExecutionLogCount'], '2');
    assert.strictEqual(result.next, undefined);
    reporter.flush();
    const joined = lines.join('\n');
    assert.match(joined, /Verifica execution log API Gateway/);
    assert.match(joined, /query execution log/);

    const output = result.output;
    assert.ok(output !== undefined);
    assert.deepStrictEqual(output[0]?.slice(-2), logRow({ requestId: 'req-1', path: '/foo' }));
    assert.deepStrictEqual(output[1]?.slice(-2), logRow({ requestId: 'req-2', path: '/bar' }));
    assert.strictEqual(output.length, 2);
  });

  it('keeps distinct requestIds that share the same path', async () => {
    const { service, calls } = createFakeCwLogs([
      logRow({ '@message': '(req-1) Execution failed' }),
      logRow({ '@message': '(req-2) Execution failed' }),
    ]);
    const step = createStep();

    const result = await step.execute(
      createContext({
        cloudWatchLogs: service,
        stepOutput: [
          logRow({ status: '500', errorMessage: 'Internal server error', requestId: 'req-1', path: '/same' }),
          logRow({ status: '503', errorMessage: 'Bad gateway', requestId: 'req-2', path: '/same' }),
          logRow({ status: '502', errorMessage: 'Duplicate retry', requestId: 'req-1', path: '/same' }),
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
    assert.deepStrictEqual(output[0]?.slice(-2), logRow({ requestId: 'req-1', path: '/same' }));
    assert.deepStrictEqual(output[1]?.slice(-2), logRow({ requestId: 'req-2', path: '/same' }));
  });

  it('reads more request ids than a query takes with one query per batch, merging their rows', async () => {
    const calls: string[] = [];
    const service = {
      async query(_groups: ReadonlyArray<string>, query: string): Promise<Rows> {
        await Promise.resolve();
        calls.push(query);
        const id = query.includes('req-1') ? 'req-1' : 'req-2';
        return [logRow({ '@timestamp': '2026-01-01 00:01:00.000', '@message': `(${id}) Execution failed` })];
      },
    };
    const result = await createStep({ maxRequestIdsOverride: 1 }).execute(
      createContext({
        cloudWatchLogs: service,
        stepOutput: [
          logRow({ status: '500', errorMessage: 'Internal server error', requestId: 'req-1', path: '/foo' }),
          logRow({ status: '503', errorMessage: 'Bad gateway', requestId: 'req-2', path: '/bar' }),
        ],
      }),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(calls.length, 2);
    assert.deepStrictEqual(
      result.output?.map((row) => readRowField(row, 'requestId')),
      ['req-1', 'req-2'],
    );
    assert.strictEqual(result.vars?.['apiGwExecutionLogMode'], 'queried');
  });

  it('degrades to unavailable and continues when a best-effort execution-log query fails', async () => {
    const { service } = createFakeCwLogs(
      [],
      new Error('MalformedQueryException: time range exceeds the log retention settings'),
    );
    const step = createStep();

    const result = await step.execute(
      createContext({
        cloudWatchLogs: service,
        stepOutput: [
          logRow({
            status: '504',
            errorMessage: 'Endpoint request timed out',
            requestId: 'req-retained-out',
            path: '/delivery/v2.3/price/1/2',
          }),
        ],
      }),
    );

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, []);
    assert.strictEqual(result.next, undefined);
    assert.strictEqual(result.vars?.['apiGwExecutionLogMode'], 'unavailable');
    assert.strictEqual(result.vars?.['apiGwExecutionLogRequestCount'], '1');
    assert.strictEqual(result.vars?.['apiGwExecutionLogCount'], '0');
    assert.match(result.vars?.['apiGwExecutionLogUnavailableReason'] ?? '', /retention settings/);
    assert.strictEqual(result.vars?.['terminationReason'], undefined);
  });

  it('keeps the batches that answered when another batch fails, declaring it unavailable', async () => {
    const service = {
      async query(_groups: ReadonlyArray<string>, query: string): Promise<Rows> {
        await Promise.resolve();
        if (query.includes('req-2')) throw new Error('ThrottlingException');
        return [logRow({ '@timestamp': '2026-01-01 00:01:00.000', '@message': '(req-1) Execution failed' })];
      },
    };
    const result = await createStep({ maxRequestIdsOverride: 1 }).execute(
      createContext({
        cloudWatchLogs: service,
        stepOutput: [
          logRow({ status: '500', errorMessage: 'Internal server error', requestId: 'req-1', path: '/foo' }),
          logRow({ status: '503', errorMessage: 'Bad gateway', requestId: 'req-2', path: '/bar' }),
        ],
      }),
    );

    assert.strictEqual(result.vars?.['apiGwExecutionLogMode'], 'queried');
    assert.strictEqual(result.output?.length, 1);
    assert.deepStrictEqual(
      result.coverage?.map(({ reason, detail }) => ({ reason, detail })),
      [{ reason: 'unavailable', detail: 'ThrottlingException' }],
    );
  });

  it('declares both the failed lookup and the errors without request id when the query fails', async () => {
    const { service } = createFakeCwLogs([], new Error('ThrottlingException'));
    const result = await createStep().execute(
      createContext({
        cloudWatchLogs: service,
        stepOutput: [
          logRow({ status: '500', errorMessage: 'Internal server error', requestId: 'req-1', path: '/foo' }),
          logRow({ status: '500', errorMessage: 'Internal server error', requestId: '-', path: '/bar' }),
        ],
      }),
    );
    assert.deepStrictEqual(
      result.coverage?.map(({ reason }) => reason),
      ['unavailable', 'skipped'],
    );
  });

  it('drops a line of another request that only mentions a requested id', async () => {
    const { service } = createFakeCwLogs([logRow({ '@message': '(req-9) Execution failed, see also req-1' })]);
    const result = await createStep().execute(
      createContext({
        cloudWatchLogs: service,
        stepOutput: [
          logRow({ status: '500', errorMessage: 'Internal server error', requestId: 'req-1', path: '/foo' }),
        ],
      }),
    );
    assert.deepStrictEqual(result.output, []);
  });

  it('declares skipped the eligible errors without a request id, next to the ones it looked up', async () => {
    const { service } = createFakeCwLogs([logRow({ '@message': '(req-1) Execution failed' })]);
    const result = await createStep().execute(
      createContext({
        cloudWatchLogs: service,
        stepOutput: [
          logRow({ status: '500', errorMessage: 'Internal server error', requestId: 'req-1', path: '/foo' }),
          logRow({ status: '500', errorMessage: 'Internal server error', requestId: '-', path: '/bar' }),
        ],
      }),
    );
    assert.deepStrictEqual(
      result.coverage?.map(({ reason, detail }) => ({ reason, detail })),
      [{ reason: 'skipped', detail: '1 errori senza requestId' }],
    );
  });

  it('attributes a line by its leading request id, not by another id it mentions', async () => {
    const { service } = createFakeCwLogs([logRow({ '@message': '(req-1) Execution failed, see also req-2' })]);
    const result = await createStep().execute(
      createContext({
        cloudWatchLogs: service,
        stepOutput: [
          logRow({ status: '500', errorMessage: 'Internal server error', requestId: 'req-2', path: '/bar' }),
          logRow({ status: '500', errorMessage: 'Internal server error', requestId: 'req-1', path: '/foo' }),
        ],
      }),
    );

    assert.deepStrictEqual(result.output?.[0]?.slice(-2), logRow({ requestId: 'req-1', path: '/foo' }));
  });

  it('declares the execution-log read skipped when no requestId can be extracted', async () => {
    const { service, calls } = createFakeCwLogs();
    const step = createStep();

    const result = await step.execute(
      createContext({
        cloudWatchLogs: service,
        stepOutput: [logRow({ status: '500', errorMessage: 'Internal server error', requestId: '-', path: '/foo' })],
      }),
    );

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, []);
    assert.strictEqual(result.vars?.['apiGwExecutionLogMode'], 'no-request-id');
    assert.deepStrictEqual(
      result.coverage?.map(({ reason }) => reason),
      ['skipped'],
    );
    assert.strictEqual(result.vars?.['apiGwExecutionLogRequestCount'], '0');
    assert.strictEqual(result.vars?.['apiGwExecutionLogRequestIds'], '');
    assert.strictEqual(result.vars?.['apiGwExecutionLogPaths'], '');
    assert.strictEqual(result.vars?.['terminationReason'], undefined);
    assert.strictEqual(result.vars?.['lastErrorMsg'], undefined);
    assert.strictEqual(result.next, undefined);
    assert.strictEqual(calls.length, 0);
  });
});
