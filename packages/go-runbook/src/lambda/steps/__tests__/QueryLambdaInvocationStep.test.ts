import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import { QueryLambdaInvocationStep } from '../QueryLambdaInvocationStep.js';

function context(vars: Map<string, string>): RunbookContext {
  return { vars, stepResults: new Map() } as unknown as RunbookContext;
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
