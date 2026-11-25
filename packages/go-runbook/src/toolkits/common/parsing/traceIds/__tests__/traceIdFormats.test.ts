import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { canonicalTraceId } from '../traceIdentity.js';
import { messageTraceIds } from '../traceIdentity.js';
import { traceIdForms } from '../traceIdentity.js';
import { traceIdFormatOf } from '../traceIdFormats.js';

const XRAY = '1-6789abcd-0123456789abcdef01234567';
const COMPACT = '6789abcd0123456789abcdef01234567';
const UUID = 'c84c10f5-c213-44bd-9d46-e71204834571';

describe('trace id formats', () => {
  it('recognizes every known kind of tracing id, in canonical form', () => {
    const cases: ReadonlyArray<readonly [string, string, string]> = [
      [XRAY.toUpperCase(), XRAY, 'x-ray'],
      [COMPACT, XRAY, 'x-ray'],
      [`FALLBACK-UUID:${UUID.toUpperCase()}`, `FALLBACK-UUID:${UUID}`, 'fallback-uuid'],
      [`fallback-uuid:${UUID}`, `FALLBACK-UUID:${UUID}`, 'fallback-uuid'],
      [`traceId:${UUID.toUpperCase()}`, `traceId:${UUID}`, 'prefixed-uuid'],
    ];
    for (const [raw, canonical, name] of cases) {
      const match = traceIdFormatOf(raw);
      assert.equal(match?.canonical, canonical, raw);
      assert.equal(match?.format.name, name, raw);
    }
  });

  it('reads the trace of an X-Ray and of a W3C traceparent header', () => {
    assert.equal(canonicalTraceId(`Root=${XRAY};Parent=0123456789abcdef;Sampled=1`), XRAY);
    assert.equal(canonicalTraceId(`00-${COMPACT}-0123456789abcdef-01`), XRAY);
  });

  it('rejects values that are not tracing ids', () => {
    for (const raw of ['0'.repeat(32), UUID, `traceId:${UUID}x`, 'FALLBACK-UUID:', 'not-a-trace', '']) {
      assert.equal(canonicalTraceId(raw), undefined, raw);
    }
  });

  it('looks up each kind in the forms the logs write it', () => {
    assert.deepEqual(traceIdForms(XRAY), [XRAY, COMPACT]);
    assert.deepEqual(traceIdForms(`traceId:${UUID}`), [`traceId:${UUID}`]);
    assert.deepEqual(traceIdForms(`FALLBACK-UUID:${UUID}`), [`FALLBACK-UUID:${UUID}`]);
    assert.deepEqual(traceIdForms('opaque'), ['opaque']);
  });

  it('finds the tracing ids of every kind that a message names', () => {
    assert.deepEqual(
      [...messageTraceIds(`calls ${XRAY} with traceId:${UUID} and FALLBACK-UUID:${UUID.toUpperCase()}`)],
      [XRAY, `FALLBACK-UUID:${UUID}`, `traceId:${UUID}`],
    );
  });
});
