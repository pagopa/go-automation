import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import type { ResultField } from '@aws-sdk/client-cloudwatch-logs';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';
import type { CloudWatchLogsService } from '../../../services/CloudWatchLogsService.js';
import type { TimeRange } from '../../../types/TimeRange.js';

import { queryServiceLogs } from '../QueryServiceLogsStep.js';

interface CapturedCall {
  readonly logGroups: ReadonlyArray<string>;
  readonly query: string;
  readonly timeRange: TimeRange;
}

function createFakeCwLogs(results: ReadonlyArray<ReadonlyArray<ResultField>> = []): {
  service: CloudWatchLogsService;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  const service = {
    query: mock.fn(
      async (
        logGroups: ReadonlyArray<string>,
        query: string,
        timeRange: TimeRange,
      ): Promise<ReadonlyArray<ReadonlyArray<ResultField>>> => {
        await Promise.resolve();
        calls.push({ logGroups: [...logGroups], query, timeRange });
        return results;
      },
    ),
  } as unknown as CloudWatchLogsService;
  return { service, calls };
}

function createContext(args: {
  readonly vars?: Record<string, string>;
  readonly cloudWatchLogs: CloudWatchLogsService;
}): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map(),
    vars: new Map(Object.entries(args.vars ?? {})),
    params: new Map<string, string>([
      ['startTime', '2026-01-01T00:00:00.000Z'],
      ['endTime', '2026-01-01T00:10:00.000Z'],
    ]),
    logs: [],
    services: { cloudWatchLogs: args.cloudWatchLogs } as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

describe('queryServiceLogs', () => {
  it('skips the AWS call when no identifier is available', async () => {
    const { service, calls } = createFakeCwLogs();
    const step = queryServiceLogs({
      id: 'q',
      label: 'Q',
      logGroups: ['/aws/ecs/foo'],
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    });

    const result = await step.execute(createContext({ cloudWatchLogs: service }));

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, []);
    assert.strictEqual(calls.length, 0);
  });

  it('issues a single-clause filter when only xRayTraceId is present', async () => {
    const { service, calls } = createFakeCwLogs([[{ field: '@message', value: 'hit' }]]);
    const step = queryServiceLogs({
      id: 'q',
      label: 'Q',
      logGroups: ['/aws/ecs/foo'],
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    });

    const result = await step.execute(createContext({ vars: { xRayTraceId: '1-abc' }, cloudWatchLogs: service }));

    assert.strictEqual(result.success, true);
    assert.strictEqual(calls.length, 1);
    const call = calls[0];
    assert.ok(call !== undefined);
    assert.match(call.query, /filter @message like '1-abc'/);
    assert.doesNotMatch(call.query, /\bor\b/);
  });

  it('OR-joins both clauses when xRayTraceId and fallbackUuid are present', async () => {
    const { service, calls } = createFakeCwLogs();
    const step = queryServiceLogs({
      id: 'q',
      label: 'Q',
      logGroups: ['/aws/ecs/foo'],
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    });

    await step.execute(
      createContext({
        vars: { xRayTraceId: '1-abc', fallbackUuid: 'uuid-1' },
        cloudWatchLogs: service,
      }),
    );

    const call = calls[0];
    assert.ok(call !== undefined);
    assert.match(call.query, /filter @message like '1-abc' or @message like 'uuid-1'/);
  });

  it('escapes single quotes in identifiers (SQL escaping)', async () => {
    const { service, calls } = createFakeCwLogs();
    const step = queryServiceLogs({
      id: 'q',
      label: 'Q',
      logGroups: ['/aws/ecs/foo'],
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    });

    await step.execute(createContext({ vars: { xRayTraceId: "trace'injected" }, cloudWatchLogs: service }));

    const call = calls[0];
    assert.ok(call !== undefined);
    assert.match(call.query, /'trace''injected'/);
  });

  it('queries only the fallback when xRayTraceId is empty', async () => {
    const { service, calls } = createFakeCwLogs();
    const step = queryServiceLogs({
      id: 'q',
      label: 'Q',
      logGroups: ['/aws/ecs/foo'],
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    });

    await step.execute(
      createContext({
        vars: { xRayTraceId: '   ', fallbackUuid: 'uuid-only' },
        cloudWatchLogs: service,
      }),
    );

    const call = calls[0];
    assert.ok(call !== undefined);
    assert.match(call.query, /filter @message like 'uuid-only'/);
    assert.doesNotMatch(call.query, /1-abc/);
  });

  it('honours custom var names', async () => {
    const { service, calls } = createFakeCwLogs();
    const step = queryServiceLogs({
      id: 'q',
      label: 'Q',
      logGroups: ['/aws/ecs/foo'],
      xRayTraceIdVar: 'customTrace',
      fallbackUuidVar: 'customFallback',
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    });

    await step.execute(
      createContext({
        vars: { customTrace: 'trace-1', customFallback: 'fb-1' },
        cloudWatchLogs: service,
      }),
    );

    const call = calls[0];
    assert.ok(call !== undefined);
    assert.match(call.query, /'trace-1'/);
    assert.match(call.query, /'fb-1'/);
  });

  it('returns the rows produced by the CloudWatch Logs service', async () => {
    const rows: ReadonlyArray<ReadonlyArray<ResultField>> = [
      [{ field: '@message', value: 'row1' }],
      [{ field: '@message', value: 'row2' }],
    ];
    const { service } = createFakeCwLogs(rows);
    const step = queryServiceLogs({
      id: 'q',
      label: 'Q',
      logGroups: ['/aws/ecs/foo'],
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    });

    const result = await step.execute(createContext({ vars: { xRayTraceId: '1-abc' }, cloudWatchLogs: service }));

    assert.deepStrictEqual(result.output, rows);
  });
});
