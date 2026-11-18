import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { QueryDownstreamLogsStep } from '../QueryDownstreamLogsStep.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';

const step = new QueryDownstreamLogsStep({
  id: 'query-pn-x',
  label: 'Query log pn-x',
  downstream: { name: 'pn-x', varPrefix: 'x', logGroup: '/aws/ecs/pn-x' },
  queryTemplate: 'fields @timestamp, @message',
  timeRangeFromParams: { start: 'startTime', end: 'endTime' },
});

describe('QueryDownstreamLogsStep', () => {
  it('no-ops (no CloudWatch query) when this downstream is not the routed target', async () => {
    const result = await step.execute(
      createTestContext({ vars: { lambdaDownstreamTarget: 'pn-other', lambdaRequestId: 'req-1' } }),
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars, undefined);
    assert.strictEqual(result.output, undefined);
  });
});
