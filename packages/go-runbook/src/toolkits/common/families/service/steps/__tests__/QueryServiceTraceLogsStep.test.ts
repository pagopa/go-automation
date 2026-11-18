import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { QueryServiceTraceLogsConfig } from '../QueryServiceTraceLogsStep.js';
import { QueryServiceTraceLogsStep } from '../QueryServiceTraceLogsStep.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';

const BASE: Omit<QueryServiceTraceLogsConfig, 'queryTemplate'> = {
  id: 'query-pn-foo-trace',
  label: 'Query log pn-foo per trace_id',
  serviceName: 'pn-foo',
  varPrefix: 'foo',
  logGroups: ['/aws/ecs/pn-foo'],
  queryProfileId: 'send-service',
  timeRangeFromParams: { start: 'startTime', end: 'endTime' },
};

describe('QueryServiceTraceLogsStep', () => {
  it('throws when the query template does not contain the trace placeholder', () => {
    assert.throws(
      () => new QueryServiceTraceLogsStep({ ...BASE, queryTemplate: "filter @message like 'x'" }),
      /TRACE_ID/,
    );
  });

  it('skips the query (no network) when no trace id is available', async () => {
    const step = new QueryServiceTraceLogsStep({ ...BASE, queryTemplate: "filter @message like '{{TRACE_ID}}'" });

    const result = await step.execute(createTestContext());

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, []);
    assert.strictEqual(result.vars?.['fooTraceLogCount'], '0');
  });
});
