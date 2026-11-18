import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { QueryLambdaInvocationStep } from '../QueryLambdaInvocationStep.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';

const step = new QueryLambdaInvocationStep({
  id: 'query-lambda-invocation',
  label: 'Ricostruzione flusso per requestId',
  lambdaLogGroup: '/aws/lambda/pn-x',
  queryTemplate: 'fields @timestamp, @message',
  timeRangeFromParams: { start: 'startTime', end: 'endTime' },
});

describe('QueryLambdaInvocationStep', () => {
  it('no-ops (no CloudWatch query) when there is no requestId', async () => {
    const result = await step.execute(createTestContext());
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars?.['lambdaInvocationLogCount'], '0');
    assert.strictEqual(result.output, undefined);
  });
});
