import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ResultField } from '@go-automation/go-common/aws';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import { ParseLambdaErrorsStep } from '../ParseLambdaErrorsStep.js';

function row(message: string): ReadonlyArray<ResultField> {
  return [
    { field: '@timestamp', value: '2026-01-01T00:00:00.000Z' },
    { field: '@message', value: message },
  ];
}

function context(stepResults: Map<string, unknown>): RunbookContext {
  return { vars: new Map(), stepResults } as unknown as RunbookContext;
}

const step = new ParseLambdaErrorsStep({
  id: 'parse-lambda-errors',
  label: 'Analisi errori Lambda',
  fromStep: 'query-lambda-errors',
  downstreamErrorPatterns: [],
});

describe('ParseLambdaErrorsStep', () => {
  it('classifies the error and writes canonical vars', async () => {
    const stepResults = new Map<string, unknown>([
      ['query-lambda-errors', [row('ERROR Invalid source details header QRCODE')]],
    ]);
    const result = await step.execute(context(stepResults));
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars?.['lambdaErrorCount'], '1');
    assert.strictEqual(result.vars?.['lambdaErrorCategory'], 'application-error');
  });

  it('stops with terminationReason no-errors when the scan is empty', async () => {
    const result = await step.execute(context(new Map<string, unknown>([['query-lambda-errors', []]])));
    assert.strictEqual(result.next, 'stop');
    assert.strictEqual(result.vars?.['terminationReason'], 'no-errors');
  });
});
