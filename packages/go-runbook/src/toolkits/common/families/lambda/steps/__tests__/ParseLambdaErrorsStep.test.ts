import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ParseLambdaErrorsStep } from '../ParseLambdaErrorsStep.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';
import { messageRow } from '../../../../../../__tests__/helpers/logRow.js';

const step = new ParseLambdaErrorsStep({
  id: 'parse-lambda-errors',
  label: 'Analisi errori Lambda',
  fromStep: 'query-lambda-errors',
  downstreamErrorPatterns: [],
  downstreamSignatures: [/External service\s+\S+\s+returned errors/i],
});

describe('ParseLambdaErrorsStep', () => {
  it('classifies the error and writes canonical vars', async () => {
    const result = await step.execute(
      createTestContext({
        stepResults: { 'query-lambda-errors': [messageRow('ERROR Invalid source details header QRCODE')] },
      }),
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars?.['lambdaErrorCount'], '1');
    assert.strictEqual(result.vars?.['lambdaErrorCategory'], 'application-error');
  });

  it('stops with terminationReason no-errors when the scan is empty', async () => {
    const result = await step.execute(createTestContext({ stepResults: { 'query-lambda-errors': [] } }));
    assert.strictEqual(result.next, 'stop');
    assert.strictEqual(result.vars?.['terminationReason'], 'no-errors');
  });
});
