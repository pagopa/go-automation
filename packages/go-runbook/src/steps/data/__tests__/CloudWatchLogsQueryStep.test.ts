import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CloudWatchLogsQueryStep } from '../CloudWatchLogsQueryStep.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';

function makeContext(params: ReadonlyArray<readonly [string, string]> = []): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map(),
    vars: new Map(),
    params: new Map(params),
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

describe('CloudWatchLogsQueryStep.getTraceInfo', () => {
  it('returns query, logGroups, and timeRange', () => {
    const step = new CloudWatchLogsQueryStep({
      id: 's',
      label: 'l',
      logGroups: ['lg-1'],
      query: 'q',
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    });
    const info = step.getTraceInfo(
      makeContext([
        ['startTime', '2026-01-01T00:00:00.000Z'],
        ['endTime', '2026-01-01T00:10:00.000Z'],
      ]),
    );
    assert.strictEqual(info['query'], 'q');
    assert.deepStrictEqual(info['logGroups'], ['lg-1']);
    assert.deepStrictEqual(info['timeRange'], {
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-01-01T00:10:00.000Z',
    });
  });

  it('propagates traceMetadata into the trace info output', () => {
    const step = new CloudWatchLogsQueryStep({
      id: 's',
      label: 'l',
      logGroups: ['lg'],
      query: 'q',
      timeRangeFromParams: { start: 'a', end: 'b' },
      traceMetadata: { queryProfileId: 'send', queryKind: 'access-log' },
    });
    const info = step.getTraceInfo(makeContext());
    assert.strictEqual(info['queryProfileId'], 'send');
    assert.strictEqual(info['queryKind'], 'access-log');
  });

  it('does NOT allow traceMetadata to override reserved keys (query, logGroups, timeRange)', () => {
    const step = new CloudWatchLogsQueryStep({
      id: 's',
      label: 'l',
      logGroups: ['real-lg'],
      query: 'real-query',
      timeRangeFromParams: { start: 'a', end: 'b' },
      traceMetadata: {
        query: 'hijacked-query',
        logGroups: ['hijacked-lg'],
        timeRange: { hijacked: true },
        queryProfileId: 'send',
      },
    });
    const info = step.getTraceInfo(makeContext());
    assert.strictEqual(info['query'], 'real-query');
    assert.deepStrictEqual(info['logGroups'], ['real-lg']);
    assert.notDeepStrictEqual(info['timeRange'], { hijacked: true });
    // Non-reserved metadata is still propagated.
    assert.strictEqual(info['queryProfileId'], 'send');
  });

  it('produces a trace info without metadata keys when traceMetadata is undefined', () => {
    const step = new CloudWatchLogsQueryStep({
      id: 's',
      label: 'l',
      logGroups: ['lg'],
      query: 'q',
      timeRangeFromParams: { start: 'a', end: 'b' },
    });
    const info = step.getTraceInfo(makeContext());
    assert.deepStrictEqual(Object.keys(info).sort(), ['logGroups', 'query', 'timeRange']);
  });
});
