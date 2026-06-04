import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import { PrepareLambdaSectionStep } from '../PrepareLambdaSectionStep.js';

function emptyContext(): RunbookContext {
  return { vars: new Map(), stepResults: new Map() } as unknown as RunbookContext;
}

describe('PrepareLambdaSectionStep', () => {
  it('seeds the canonical lambda vars without a configured timeout', async () => {
    const result = await new PrepareLambdaSectionStep({
      id: 'prepare-lambda-section',
      label: 'l',
      lambdaName: 'pn-x',
      logGroup: '/aws/lambda/pn-x',
    }).execute(emptyContext());

    assert.strictEqual(result.vars?.['lambdaFunctionName'], 'pn-x');
    assert.strictEqual(result.vars?.['lambdaLogGroup'], '/aws/lambda/pn-x');
    assert.strictEqual(result.vars?.['lambdaConfiguredTimeoutMs'], undefined);
  });

  it('emits lambdaConfiguredTimeoutMs when configured', async () => {
    const result = await new PrepareLambdaSectionStep({
      id: 'prepare-lambda-section',
      label: 'l',
      lambdaName: 'pn-x',
      logGroup: '/aws/lambda/pn-x',
      configuredTimeoutMs: 15000,
    }).execute(emptyContext());

    assert.strictEqual(result.vars?.['lambdaConfiguredTimeoutMs'], '15000');
  });
});
