import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ResultField } from '@go-automation/go-common/aws';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import { AnalyzeLambdaInvocationStep } from '../AnalyzeLambdaInvocationStep.js';
import type { DownstreamErrorPattern } from '../../types/DownstreamErrorPattern.js';

const PATTERNS: ReadonlyArray<DownstreamErrorPattern> = [
  { pattern: 'External service pn-emd-integration returned errors', target: 'pn-emd-integration' },
];

function row(message: string): ReadonlyArray<ResultField> {
  return [
    { field: '@timestamp', value: '2026-01-01T00:00:00.000Z' },
    { field: '@message', value: message },
  ];
}

function context(vars: Map<string, string>, stepResults: Map<string, unknown>): RunbookContext {
  return { vars, stepResults } as unknown as RunbookContext;
}

const step = new AnalyzeLambdaInvocationStep({
  id: 'analyze-lambda-invocation',
  label: 'Analisi flusso invocazione',
  fromStep: 'query-lambda-invocation',
  downstreamErrorPatterns: PATTERNS,
});

describe('AnalyzeLambdaInvocationStep', () => {
  it('routes to a downstream found only in the invocation flow', async () => {
    const stepResults = new Map<string, unknown>([
      ['query-lambda-invocation', [row('External service pn-emd-integration returned errors { status code 404 }')]],
    ]);
    const result = await step.execute(context(new Map([['lambdaErrorCategory', 'application-error']]), stepResults));
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars?.['lambdaDownstreamTarget'], 'pn-emd-integration');
    assert.strictEqual(result.vars?.['lambdaErrorCategory'], 'downstream');
  });

  it('is a no-op when the error scan already routed to a downstream', async () => {
    const stepResults = new Map<string, unknown>([
      ['query-lambda-invocation', [row('External service pn-emd-integration returned errors')]],
    ]);
    const result = await step.execute(
      context(new Map([['lambdaDownstreamTarget', 'pn-emd-integration']]), stepResults),
    );
    assert.strictEqual(result.vars, undefined);
  });

  it('is a no-op when the invocation step produced no output', async () => {
    const result = await step.execute(context(new Map(), new Map()));
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars, undefined);
  });

  it('enriches runtime REPORT vars from the flow when the error scan did not', async () => {
    const reportLine =
      'REPORT RequestId: 0aa702b3-3ef4-47f8-a3c3-a5fea267e4ef Duration: 30000.00 ms ' +
      'Billed Duration: 30000 ms Memory Size: 256 MB Max Memory Used: 200 MB Status: timeout';
    const stepResults = new Map<string, unknown>([
      ['query-lambda-invocation', [row('Task timed out after 30.00 seconds'), row(reportLine)]],
    ]);
    const result = await step.execute(context(new Map([['lambdaErrorCategory', 'timeout']]), stepResults));
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars?.['lambdaDurationMs'], '30000');
    assert.strictEqual(result.vars?.['lambdaRuntimeStatus'], 'timeout');
    assert.strictEqual(result.vars?.['lambdaMaxMemoryUsedMb'], '200');
  });

  it('does not overwrite REPORT vars already set by the error scan', async () => {
    const reportLine =
      'REPORT RequestId: 0aa702b3-3ef4-47f8-a3c3-a5fea267e4ef Duration: 30000.00 ms ' +
      'Memory Size: 256 MB Max Memory Used: 200 MB Status: timeout';
    const stepResults = new Map<string, unknown>([['query-lambda-invocation', [row(reportLine)]]]);
    const result = await step.execute(
      context(
        new Map([
          ['lambdaDurationMs', '999'],
          ['lambdaRuntimeStatus', 'error'],
        ]),
        stepResults,
      ),
    );
    // Pre-existing vars are left untouched (absent from the returned delta);
    // only the previously-missing memory fields are filled.
    assert.strictEqual(result.vars?.['lambdaDurationMs'], undefined);
    assert.strictEqual(result.vars?.['lambdaRuntimeStatus'], undefined);
    assert.strictEqual(result.vars?.['lambdaMaxMemoryUsedMb'], '200');
  });
});
