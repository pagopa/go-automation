import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { StopApiGwExecutionLogAnalysisStep } from '../StopApiGwExecutionLogAnalysisStep.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';

describe('stopApiGwExecutionLogAnalysis', () => {
  const step = new StopApiGwExecutionLogAnalysisStep({
    id: 'stop-execution-log-analysis',
    label: 'Stop execution log analysis',
  });

  it('does not stop the runbook when execution logs were not queried', async () => {
    const result = await step.execute(createTestContext({ vars: { apiGwExecutionLogMode: 'no-request-id' } }));

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.next, undefined);
    assert.strictEqual(result.vars, undefined);
  });

  it('stops with execution-log termination vars when execution logs were queried', async () => {
    const result = await step.execute(
      createTestContext({
        vars: {
          apiGwExecutionLogMode: 'queried',
          lastErrorMsg: "API Gateway execution log analizzati, ma non e' stato possibile determinare il problema.",
        },
      }),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.next, 'stop');
    assert.strictEqual(result.vars?.['terminationReason'], 'api-gw-execution-log-unresolved');
    assert.strictEqual(
      result.vars?.['lastErrorMsg'],
      "API Gateway execution log analizzati, ma non e' stato possibile determinare il problema.",
    );
  });
});
