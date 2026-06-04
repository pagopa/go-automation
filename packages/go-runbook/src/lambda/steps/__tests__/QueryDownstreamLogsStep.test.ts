import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import { QueryDownstreamLogsStep } from '../QueryDownstreamLogsStep.js';

function context(vars: Map<string, string>): RunbookContext {
  return { vars, stepResults: new Map() } as unknown as RunbookContext;
}

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
      context(
        new Map([
          ['lambdaDownstreamTarget', 'pn-other'],
          ['lambdaRequestId', 'req-1'],
        ]),
      ),
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars, undefined);
    assert.strictEqual(result.output, undefined);
  });
});
