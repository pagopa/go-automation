import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DescendToLambdaDownstreamStep } from '../DescendToLambdaDownstreamStep.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';

const REQUEST_ID = '0f3e2b4a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const step = new DescendToLambdaDownstreamStep('descend-downstream', new Set(['pn-downstream']));

describe('DescendToLambdaDownstreamStep', () => {
  it('descends to a readable downstream by request id', async () => {
    const result = await step.execute(
      createTestContext({ vars: { lambdaDownstreamTarget: 'pn-downstream', lambdaRequestId: REQUEST_ID } }),
    );
    assert.deepEqual(result.descend, [
      { target: 'pn-downstream', identifier: { kind: 'requestId', value: REQUEST_ID } },
    ]);
  });

  it('treats a malformed request id as a missing one', async () => {
    const result = await step.execute(
      createTestContext({ vars: { lambdaDownstreamTarget: 'pn-downstream', lambdaRequestId: "x' or 1=1" } }),
    );
    assert.deepEqual(result.descend, [{ target: 'pn-downstream', identifier: { kind: 'requestId', value: '' } }]);
  });

  it('does not descend to a downstream without a readable log group', async () => {
    const result = await step.execute(
      createTestContext({ vars: { lambdaDownstreamTarget: 'pn-other', lambdaRequestId: REQUEST_ID } }),
    );
    assert.equal(result.success, true);
    assert.equal(result.descend, undefined);
  });
});
