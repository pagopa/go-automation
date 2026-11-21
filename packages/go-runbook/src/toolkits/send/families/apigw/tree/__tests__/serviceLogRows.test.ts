import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { traceIdOfFallbackRows } from '../serviceLogRows.js';
import { SEND_API_GW_PROFILE } from '../../profiles/SEND_API_GW_PROFILE.js';
import { logRow } from '../../../../../../__tests__/helpers/logRow.js';

const SCHEMA = SEND_API_GW_PROFILE.serviceLog.schema;
const FALLBACK = '0f3e2b4a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const A = '1-6789abcd-0123456789abcdef01234567';
const B = '1-6789abcd-fedcba9876543210fedcba98';

describe('traceIdOfFallbackRows', () => {
  it('reads again by the first direct trace id of the rows, in canonical form', () => {
    const rows = [
      logRow({ trace_id: `Root=${A};Sampled=1`, '@message': `FALLBACK-UUID:${FALLBACK}` }),
      logRow({ trace_id: B.toUpperCase(), '@message': `FALLBACK-UUID:${FALLBACK}` }),
    ];
    assert.deepStrictEqual(traceIdOfFallbackRows(rows, { kind: 'fallbackUuid', value: FALLBACK }, SCHEMA), {
      kind: 'traceId',
      value: B,
    });
  });
});
