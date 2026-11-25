import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DescendToTraceStep } from '../DescendToTraceStep.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';

const TRACE = '1-6789abcd-0123456789abcdef01234567';
const step = new DescendToTraceStep('descend-trace', 'pn-service-trace', 'pnServiceTraceId');

describe('DescendToTraceStep', () => {
  it('descends to the trace of the error', async () => {
    const result = await step.execute(createTestContext({ vars: { pnServiceTraceId: TRACE } }));
    assert.deepEqual(result.descend, [{ target: 'pn-service-trace', identifier: { kind: 'traceId', value: TRACE } }]);
  });

  it('leaves an error without trace id as a leaf', async () => {
    const result = await step.execute(createTestContext({ vars: { pnServiceTraceId: ' ' } }));
    assert.equal(result.success, true);
    assert.equal(result.descend, undefined);
  });
});
