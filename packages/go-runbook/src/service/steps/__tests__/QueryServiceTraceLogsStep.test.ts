import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';
import type { QueryServiceTraceLogsConfig } from '../queryServiceTraceLogs.js';
import { QueryServiceTraceLogsStep } from '../queryServiceTraceLogs.js';

const BASE: Omit<QueryServiceTraceLogsConfig, 'queryTemplate'> = {
  id: 'query-pn-foo-trace',
  label: 'Query log pn-foo per trace_id',
  serviceName: 'pn-foo',
  varPrefix: 'foo',
  logGroups: ['/aws/ecs/pn-foo'],
  queryProfileId: 'send-service',
  timeRangeFromParams: { start: 'startTime', end: 'endTime' },
};

function ctx(vars: ReadonlyArray<readonly [string, string]> = []): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-06-09T00:00:00.000Z'),
    stepResults: new Map<string, unknown>(),
    vars: new Map<string, string>(vars),
    params: new Map<string, string>(),
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

describe('QueryServiceTraceLogsStep', () => {
  it('throws when the query template does not contain the trace placeholder', () => {
    assert.throws(
      () => new QueryServiceTraceLogsStep({ ...BASE, queryTemplate: "filter @message like 'x'" }),
      /TRACE_ID/,
    );
  });

  it('skips the query (no network) when no trace id is available', async () => {
    const step = new QueryServiceTraceLogsStep({ ...BASE, queryTemplate: "filter @message like '{{TRACE_ID}}'" });

    const result = await step.execute(ctx());

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, []);
    assert.strictEqual(result.vars?.['fooTraceLogCount'], '0');
  });
});
