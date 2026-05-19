import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import type { ResultField } from '@go-automation/go-common/aws';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';
import type { CloudWatchLogsQueryService } from '../../../services/CloudWatchLogsQueryService.js';
import type { TimeRange } from '../../../types/TimeRange.js';

import { queryServiceLogs } from '../QueryServiceLogsStep.js';

interface CapturedCall {
  readonly logGroups: ReadonlyArray<string>;
  readonly query: string;
  readonly timeRange: TimeRange;
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
      ): Promise<ReadonlyArray<ReadonlyArray<ResultField>>> => {
        await Promise.resolve();
        calls.push({ logGroups: [...logGroups], query, timeRange });
        return results;
      },
    ),
  } as unknown as CloudWatchLogsQueryService;
  return { service, calls };
}

function createContext(args: {
  readonly vars?: Record<string, string>;
  readonly cloudWatchLogs: CloudWatchLogsQueryService;
  readonly capturedLines?: string[];
}): RunbookContext {
  const ctx: RunbookContext = {
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
  if (args.capturedLines !== undefined) {
    const captured = args.capturedLines;
    const logger = {
      text: (msg: string) => captured.push(msg),
      newline: () => captured.push(''),
    };
    return { ...ctx, logger } as unknown as RunbookContext;
  }
  return ctx;
}

describe('queryServiceLogs', () => {
  it('skips the AWS call when no identifier is available', async () => {
    const { service, calls } = createFakeCwLogs();
    const step = queryServiceLogs({
      id: 'q',
      label: 'Q',
      serviceName: 'pn-foo',
      entryService: true,
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
      serviceName: 'pn-foo',
      entryService: true,
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

  it('uses only fallbackUuid when both xRayTraceId and fallbackUuid are present', async () => {
    const { service, calls } = createFakeCwLogs();
    const step = queryServiceLogs({
      id: 'q',
      label: 'Q',
      serviceName: 'pn-foo',
      entryService: true,
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
    assert.match(call.query, /filter @message like 'uuid-1'/);
    assert.doesNotMatch(call.query, /1-abc/);
    assert.doesNotMatch(call.query, /\bor\b/);
  });

  it('escapes single quotes in identifiers (SQL escaping)', async () => {
    const { service, calls } = createFakeCwLogs();
    const step = queryServiceLogs({
      id: 'q',
      label: 'Q',
      serviceName: 'pn-foo',
      entryService: true,
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
      serviceName: 'pn-foo',
      entryService: true,
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
      serviceName: 'pn-foo',
      entryService: true,
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
    assert.match(call.query, /'fb-1'/);
    assert.doesNotMatch(call.query, /'trace-1'/);
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
      serviceName: 'pn-foo',
      entryService: true,
      logGroups: ['/aws/ecs/foo'],
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    });

    const result = await step.execute(createContext({ vars: { xRayTraceId: '1-abc' }, cloudWatchLogs: service }));

    assert.deepStrictEqual(result.output, rows);
  });

  it('increments apiGwVisitCount only when entering a NEW service', async () => {
    const { service } = createFakeCwLogs([[{ field: '@message', value: 'r' }]]);
    const step = queryServiceLogs({
      id: 'q',
      label: 'Q',
      serviceName: 'pn-foo',
      entryService: true,
      logGroups: ['/aws/ecs/foo'],
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    });

    // First visit on pn-foo (no previous service tracked).
    const r1 = await step.execute(createContext({ vars: { xRayTraceId: '1-abc' }, cloudWatchLogs: service }));
    assert.strictEqual(r1.vars?.['apiGwVisitCount'], '1');
    assert.strictEqual(r1.vars?.['apiGwLastService'], 'pn-foo');
    assert.strictEqual(r1.vars?.['apiGwQueryCount'], '1');
    assert.strictEqual(r1.vars?.['apiGwServicesVisited'], 'pn-foo|1');

    // Re-query on the SAME service (fallback-uuid retry / trace_id swap).
    const r2 = await step.execute(
      createContext({
        vars: {
          xRayTraceId: '1-abc',
          apiGwVisitCount: '1',
          apiGwLastService: 'pn-foo',
          apiGwQueryCount: '1',
          apiGwServicesVisited: 'pn-foo|1',
        },
        cloudWatchLogs: service,
      }),
    );
    // Visit counter unchanged, query counter bumped, chain entry rewritten.
    assert.strictEqual(r2.vars?.['apiGwVisitCount'], '1');
    assert.strictEqual(r2.vars?.['apiGwQueryCount'], '2');
    assert.strictEqual(r2.vars?.['apiGwServicesVisited'], 'pn-foo|1');
  });

  it('increments apiGwVisitCount and appends to the chain when switching to a different service', async () => {
    const { service } = createFakeCwLogs([[{ field: '@message', value: 'r1' }], [{ field: '@message', value: 'r2' }]]);
    const step = queryServiceLogs({
      id: 'q',
      label: 'Q',
      serviceName: 'pn-bar',
      entryService: false,
      logGroups: ['/aws/ecs/bar'],
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    });

    const result = await step.execute(
      createContext({
        vars: {
          xRayTraceId: '1-abc',
          apiGwVisitCount: '1',
          apiGwLastService: 'pn-foo',
          apiGwQueryCount: '1',
          apiGwServicesVisited: 'pn-foo|42',
        },
        cloudWatchLogs: service,
      }),
    );

    assert.strictEqual(result.vars?.['apiGwVisitCount'], '2');
    assert.strictEqual(result.vars?.['apiGwLastService'], 'pn-bar');
    assert.strictEqual(result.vars?.['apiGwQueryCount'], '2');
    assert.strictEqual(result.vars?.['apiGwServicesVisited'], 'pn-foo|42,pn-bar|2');
  });

  it('emits the "Query fallita" reporter banner when the AWS call throws', async () => {
    // Simulate a CloudWatch ResourceNotFoundException (e.g. a runbook
    // pointing at a misconfigured log group).
    const throwingService = {
      query: async (): Promise<never> => {
        await Promise.resolve();
        throw new Error(
          "[ResourceNotFoundException] Log group '/aws/ecs/pn-data-vault-sep' does not exist for account ID '510769970275'",
        );
      },
    } as unknown as CloudWatchLogsQueryService;

    const step = queryServiceLogs({
      id: 'q',
      label: 'Q',
      serviceName: 'pn-data-vault',
      entryService: false,
      logGroups: ['/aws/ecs/pn-data-vault-sep'],
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    });

    const captured: string[] = [];
    const result = await step.execute(
      createContext({
        vars: { xRayTraceId: '1-abc' },
        cloudWatchLogs: throwingService,
        capturedLines: captured,
      }),
    );

    // The step returns a failed StepResult (executeStep converts the
    // thrown error), and the reporter banner is rendered before the
    // re-throw so the failure is visible in the structured output.
    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /CloudWatch service logs query failed/);
    const joined = captured.join('\n');
    assert.match(joined, /⚠ Query fallita/);
    assert.match(joined, /Log group: \/aws\/ecs\/pn-data-vault-sep/);
    assert.match(
      joined,
      /Causa: \[ResourceNotFoundException\] Log group '\/aws\/ecs\/pn-data-vault-sep' does not exist/,
    );
  });

  it('throws at construction when the queryTemplate lacks the {{FILTER_CLAUSE}} placeholder', () => {
    assert.throws(
      () =>
        queryServiceLogs({
          id: 'q',
          label: 'Q',
          serviceName: 'pn-foo',
          entryService: true,
          logGroups: ['/aws/ecs/foo'],
          // Missing `{{FILTER_CLAUSE}}` — without the placeholder the
          // step would silently scan the whole log group.
          queryTemplateOverride: 'fields @timestamp, @message | sort @timestamp asc',
          timeRangeFromParams: { start: 'startTime', end: 'endTime' },
        }),
      /\{\{FILTER_CLAUSE\}\} placeholder/,
    );
  });
});
