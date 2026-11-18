import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PrepareLambdaSectionStep } from '../PrepareLambdaSectionStep.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';

describe('PrepareLambdaSectionStep', () => {
  it('seeds the canonical lambda vars, with lambdaConfiguredTimeoutMs only when configured', async () => {
    const config = { id: 'prepare-lambda-section', label: 'l', lambdaName: 'pn-x', logGroup: '/aws/lambda/pn-x' };

    const plain = await new PrepareLambdaSectionStep(config).execute(createTestContext());
    const withTimeout = await new PrepareLambdaSectionStep({ ...config, configuredTimeoutMs: 15000 }).execute(
      createTestContext(),
    );

    assert.strictEqual(plain.vars?.['lambdaFunctionName'], 'pn-x');
    assert.strictEqual(plain.vars?.['lambdaLogGroup'], '/aws/lambda/pn-x');
    assert.strictEqual(plain.vars?.['lambdaConfiguredTimeoutMs'], undefined);
    assert.strictEqual(withTimeout.vars?.['lambdaConfiguredTimeoutMs'], '15000');
  });
});
