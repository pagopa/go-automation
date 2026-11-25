import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractTraceId } from '../extractTraceId.js';
import { SEND_API_GW_PROFILE } from '../../../../../send/families/apigw/profiles/SEND_API_GW_PROFILE.js';
import type { AccessLogSchema } from '../AccessLogSchema.js';
import { logRow } from '../../../../../../__tests__/helpers/logRow.js';

const SEND_SCHEMA = SEND_API_GW_PROFILE.accessLog.schema;

describe('extractTraceId', () => {
  it('extracts Root=<v> from the SEND xrayTraceId field, or keeps the raw value when the pattern does not match', () => {
    assert.strictEqual(extractTraceId(logRow({ xrayTraceId: 'Root=1-abc-def' }), SEND_SCHEMA), '1-abc-def');
    assert.strictEqual(
      extractTraceId(logRow({ xrayTraceId: 'no-root-prefix-here' }), SEND_SCHEMA),
      'no-root-prefix-here',
    );
  });

  it('extracts only the id from a SEND X-Ray header with other fields', () => {
    const trace = '1-6ad1eae3-493a74b231f3e345492729e9';
    const other = '1-6ad1eae3-111111111111111111111111';
    assert.strictEqual(
      extractTraceId(logRow({ xrayTraceId: `Root=${trace};Parent=f23cf74b4e3a3bc6;Sampled=1` }), SEND_SCHEMA),
      trace,
    );
    assert.strictEqual(extractTraceId(logRow({ xrayTraceId: `Self=${other};Root=${trace}` }), SEND_SCHEMA), trace);
  });

  it('returns the raw value when no pattern is configured (INTEROP-like)', () => {
    // Rest destructuring omits the optional `traceIdExtractPattern` (exactOptionalPropertyTypes).
    const { traceIdExtractPattern: _ignored, ...sendWithoutPattern } = SEND_SCHEMA;
    const interopLikeSchema: AccessLogSchema = {
      ...sendWithoutPattern,
      traceIdField: 'cid',
      traceIdLabel: 'cid',
      traceIdContextVar: 'traceId',
    };
    const cid = '550e8400-e29b-41d4-a716-446655440000';
    assert.strictEqual(extractTraceId(logRow({ cid }), interopLikeSchema), cid);
  });

  it('returns undefined when the field is absent in the row', () => {
    assert.strictEqual(extractTraceId([], SEND_SCHEMA), undefined);
  });
});
