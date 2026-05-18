import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ResultField } from '@go-automation/go-common/aws';
import { extractTraceId, extractXRayTraceId } from '../extractTraceId.js';
import { SEND_API_GW_PROFILE } from '../../profiles/SEND_API_GW_PROFILE.js';
import type { AccessLogSchema } from '../../profiles/schemas/AccessLogSchema.js';

const SEND_SCHEMA = SEND_API_GW_PROFILE.accessLog.schema;

function row(fields: Record<string, string>): ResultField[] {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

describe('extractTraceId', () => {
  it('extracts Root=<v> from the SEND xrayTraceId field', () => {
    const r = row({ xrayTraceId: 'Root=1-abc-def' });
    assert.strictEqual(extractTraceId(r, SEND_SCHEMA), '1-abc-def');
  });

  it('returns the raw value when no pattern is configured (INTEROP-like)', () => {
    // Use rest destructuring to omit the optional `traceIdExtractPattern`
    // (the schema is exactOptionalPropertyTypes-strict).
    const { traceIdExtractPattern: _ignored, ...sendWithoutPattern } = SEND_SCHEMA;
    void _ignored;
    const interopLikeSchema: AccessLogSchema = {
      ...sendWithoutPattern,
      traceIdField: 'cid',
      traceIdLabel: 'cid',
      traceIdContextVar: 'traceId',
    };
    const r = row({ cid: '550e8400-e29b-41d4-a716-446655440000' });
    assert.strictEqual(extractTraceId(r, interopLikeSchema), '550e8400-e29b-41d4-a716-446655440000');
  });

  it('returns the raw value when the pattern is configured but does not match', () => {
    const r = row({ xrayTraceId: 'no-root-prefix-here' });
    assert.strictEqual(extractTraceId(r, SEND_SCHEMA), 'no-root-prefix-here');
  });

  it('returns undefined when the field is absent in the row', () => {
    assert.strictEqual(extractTraceId([], SEND_SCHEMA), undefined);
  });
});

describe('extractXRayTraceId (deprecated alias)', () => {
  it('forwards to extractTraceId', () => {
    const r = row({ xrayTraceId: 'Root=1-abc-def' });
    assert.strictEqual(extractXRayTraceId(r, SEND_SCHEMA), '1-abc-def');
  });
});
