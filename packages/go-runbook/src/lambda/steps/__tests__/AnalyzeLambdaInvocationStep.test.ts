import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ResultField } from '@go-automation/go-common/aws';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import { analyzeLambdaInvocation } from '../AnalyzeLambdaInvocationStep.js';
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

const step = analyzeLambdaInvocation({
  id: 'analyze-lambda-invocation',
  label: 'Analisi flusso invocazione',
  fromStep: 'query-lambda-invocation',
  downstreamErrorPatterns: PATTERNS,
});

describe('analyzeLambdaInvocation', () => {
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
});
