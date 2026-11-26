import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { enumerateApiGwRequests } from '../enumerateApiGwRequests.js';
import { SEND_API_GW_PROFILE } from '../../profiles/SEND_API_GW_PROFILE.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';
import { logRow } from '../../../../../../__tests__/helpers/logRow.js';

const TRACE = '1-6ad1eae3-493a74b231f3e345492729e9';

function correlations(xrayTraceId: string): ReadonlyArray<unknown> {
  const enumerate = enumerateApiGwRequests({
    accessLogStepId: 'query-api-gw',
    minStatusCode: 500,
    schema: SEND_API_GW_PROFILE.accessLog.schema,
  });
  const rows = [logRow({ status: '502', requestId: 'a1b2c3d4-0000-4000-8000-000000000001', xrayTraceId })];
  return enumerate({ context: createTestContext({ stepResults: { 'query-api-gw': rows } }), rows: [] }).nodes.map(
    (node) => node.correlation,
  );
}

describe('enumerateApiGwRequests', () => {
  it('correlates a request with the canonical trace of its X-Ray header', () => {
    assert.deepStrictEqual(correlations(`Root=${TRACE.toUpperCase()};Sampled=1`), [
      { requestId: 'a1b2c3d4-0000-4000-8000-000000000001', traceId: TRACE },
    ]);
  });

  it('gives no trace correlation for a value that is not a trace id', () => {
    assert.deepStrictEqual(correlations('Root=legacy-id;Sampled=1'), [
      { requestId: 'a1b2c3d4-0000-4000-8000-000000000001' },
    ]);
  });
});
