import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DescendToServiceStep } from '../DescendToServiceStep.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';

const TRACE = '1-6789abcd-0123456789abcdef01234567';
const FALLBACK = '0f3e2b4a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

const step = new DescendToServiceStep({
  id: 'descend-from-pn-a',
  label: 'Discesa da pn-a',
  service: { name: 'pn-a', varPrefix: 'pnA' },
  servicesInRunbook: new Set(['pn-b']),
  traceIdContextVar: 'xRayTraceId',
});

describe('DescendToServiceStep', () => {
  it('follows the fallback UUID of the call when it has one', async () => {
    const result = await step.execute(
      createTestContext({ vars: { pnANextUrlTarget: 'pn-b', fallbackUuid: FALLBACK, xRayTraceId: TRACE } }),
    );
    assert.deepEqual(result.descend, [{ target: 'pn-b', identifier: FALLBACK, kind: 'fallbackUuid' }]);
  });

  it('otherwise follows the canonical trace id, without the other X-Ray fields', async () => {
    const result = await step.execute(
      createTestContext({ vars: { pnANextUrlTarget: 'pn-b', fallbackUuid: '-', xRayTraceId: `${TRACE};Sampled=1` } }),
    );
    assert.deepEqual(result.descend, [{ target: 'pn-b', identifier: TRACE, kind: 'traceId' }]);
  });

  it('names a downstream outside the runbook without descending', async () => {
    const result = await step.execute(
      createTestContext({ vars: { pnANextUrlTarget: 'pn-external', pnAErrorMsg: 'call failed' } }),
    );
    assert.equal(result.descend, undefined);
    assert.equal(result.vars?.['downstreamTarget'], 'pn-external');
    assert.equal(result.vars?.['lastErrorMsg'], 'call failed');
  });
});
