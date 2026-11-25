import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { StepResult } from '../../../../../../engine/types/StepResult.js';
import { AnalyzeLambdaInvocationStep } from '../AnalyzeLambdaInvocationStep.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';
import { messageRow } from '../../../../../../__tests__/helpers/logRow.js';

const step = new AnalyzeLambdaInvocationStep({
  id: 'analyze-lambda-invocation',
  label: 'Analisi flusso invocazione',
  fromStep: 'query-lambda-invocation',
  downstreamErrorPatterns: [
    { pattern: 'External service pn-emd-integration returned errors', target: 'pn-emd-integration' },
  ],
});

/** Runs the step over the invocation rows, with the vars the error scan already wrote. */
async function analyze(
  vars: Readonly<Record<string, string>>,
  invocationRows?: ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>,
): Promise<StepResult<undefined>> {
  return step.execute(
    createTestContext({
      vars,
      stepResults: invocationRows === undefined ? {} : { 'query-lambda-invocation': invocationRows },
    }),
  );
}

describe('AnalyzeLambdaInvocationStep', () => {
  it('routes to a downstream found only in the invocation flow', async () => {
    const result = await analyze({ lambdaErrorCategory: 'application-error' }, [
      messageRow('External service pn-emd-integration returned errors { status code 404 }'),
    ]);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars?.['lambdaDownstreamTarget'], 'pn-emd-integration');
    assert.strictEqual(result.vars?.['lambdaErrorCategory'], 'downstream');
  });

  it('is a no-op when the error scan already routed to a downstream or the invocation step produced no output', async () => {
    const routed = await analyze({ lambdaDownstreamTarget: 'pn-emd-integration' }, [
      messageRow('External service pn-emd-integration returned errors'),
    ]);
    const empty = await analyze({});
    assert.strictEqual(routed.vars, undefined);
    assert.strictEqual(empty.success, true);
    assert.strictEqual(empty.vars, undefined);
  });

  it('enriches runtime REPORT vars from the flow when the error scan did not', async () => {
    const reportLine =
      'REPORT RequestId: 0aa702b3-3ef4-47f8-a3c3-a5fea267e4ef Duration: 30000.00 ms ' +
      'Billed Duration: 30000 ms Memory Size: 256 MB Max Memory Used: 200 MB Status: timeout';
    const result = await analyze({ lambdaErrorCategory: 'timeout' }, [
      messageRow('Task timed out after 30.00 seconds'),
      messageRow(reportLine),
    ]);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars?.['lambdaDurationMs'], '30000');
    assert.strictEqual(result.vars?.['lambdaRuntimeStatus'], 'timeout');
    assert.strictEqual(result.vars?.['lambdaMaxMemoryUsedMb'], '200');
  });

  it('does not overwrite REPORT vars already set by the error scan', async () => {
    const reportLine =
      'REPORT RequestId: 0aa702b3-3ef4-47f8-a3c3-a5fea267e4ef Duration: 30000.00 ms ' +
      'Memory Size: 256 MB Max Memory Used: 200 MB Status: timeout';
    const result = await analyze({ lambdaDurationMs: '999', lambdaRuntimeStatus: 'error' }, [messageRow(reportLine)]);
    // Pre-existing vars are left untouched (absent from the returned delta);
    // only the previously-missing memory fields are filled.
    assert.strictEqual(result.vars?.['lambdaDurationMs'], undefined);
    assert.strictEqual(result.vars?.['lambdaRuntimeStatus'], undefined);
    assert.strictEqual(result.vars?.['lambdaMaxMemoryUsedMb'], '200');
  });
});
