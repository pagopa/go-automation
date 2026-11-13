import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { QueryLambdaInvocationStep } from '../QueryLambdaInvocationStep.js';
import { createTestServiceRegistry } from '../../../../testing/createTestServiceRegistry.js';
import type { OperationalContext } from '../../../../services/OperationalContext.js';

function context(vars: Map<string, string>): OperationalContext {
  return { vars, stepResults: new Map(), services: createTestServiceRegistry() } as unknown as OperationalContext;
}

const step = new QueryLambdaInvocationStep({
  id: 'query-lambda-invocation',
  label: 'Ricostruzione flusso per requestId',
  lambdaLogGroup: '/aws/lambda/pn-x',
  queryTemplate: 'fields @timestamp, @message',
  timeRangeFromParams: { start: 'startTime', end: 'endTime' },
});

describe('QueryLambdaInvocationStep', () => {
  it('no-ops (no CloudWatch query) when there is no requestId', async () => {
    const result = await step.execute(context(new Map()));
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars?.['lambdaInvocationLogCount'], '0');
    assert.strictEqual(result.output, undefined);
  });
});
