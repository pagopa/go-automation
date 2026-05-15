import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ResultField } from '@aws-sdk/client-cloudwatch-logs';
import { extractFallbackUuid, extractFallbackUuidFromMessage } from '../extractFallbackUuid.js';
import { SEND_API_GW_PROFILE } from '../../profiles/SEND_API_GW_PROFILE.js';

const SCHEMA = SEND_API_GW_PROFILE.serviceLog.schema;

function row(message: string): ResultField[] {
  return [{ field: 'message', value: message }];
}

describe('extractFallbackUuid', () => {
  it('extracts the UUID from the canonical FALLBACK-UUID:<uuid> form', () => {
    const rows: ReadonlyArray<ResultField[]> = [
      row(
        'error upserting service activation message=500 Internal Server Error ... "traceId":"FALLBACK-UUID:2ae8a94e-50fc-445a-b9e2-989637cc129f" ...',
      ),
    ];
    assert.strictEqual(extractFallbackUuid(rows, SCHEMA), '2ae8a94e-50fc-445a-b9e2-989637cc129f');
  });

  it('returns the first match across multiple rows', () => {
    const rows: ReadonlyArray<ResultField[]> = [
      row('something else without uuid'),
      row('FALLBACK-UUID:11111111-1111-1111-1111-111111111111'),
      row('FALLBACK-UUID:22222222-2222-2222-2222-222222222222'),
    ];
    assert.strictEqual(extractFallbackUuid(rows, SCHEMA), '11111111-1111-1111-1111-111111111111');
  });

  it('returns undefined when no row contains the token', () => {
    const rows: ReadonlyArray<ResultField[]> = [row('plain log line'), row('another one')];
    assert.strictEqual(extractFallbackUuid(rows, SCHEMA), undefined);
  });

  it('ignores tokens that are not actual UUIDs', () => {
    const rows: ReadonlyArray<ResultField[]> = [row('FALLBACK-UUID:not-a-uuid'), row('FALLBACK-UUID:12345')];
    assert.strictEqual(extractFallbackUuid(rows, SCHEMA), undefined);
  });

  it('does not confuse the X-Ray trace id (1-XXXX-YYYY) with a fallback UUID', () => {
    const rows: ReadonlyArray<ResultField[]> = [row('AWS-XRAY-TRACE-ID: 1-68ed8e4c-7eca209c6633327075752c8f')];
    assert.strictEqual(extractFallbackUuid(rows, SCHEMA), undefined);
  });

  it('reads @message when message field is absent', () => {
    const rows: ReadonlyArray<ResultField[]> = [
      [{ field: '@message', value: 'FALLBACK-UUID:33333333-3333-3333-3333-333333333333' }],
    ];
    assert.strictEqual(extractFallbackUuid(rows, SCHEMA), '33333333-3333-3333-3333-333333333333');
  });
});

describe('extractFallbackUuidFromMessage', () => {
  it('extracts the UUID from a single message string', () => {
    const msg = '"traceId":"FALLBACK-UUID:44444444-4444-4444-4444-444444444444"';
    assert.strictEqual(extractFallbackUuidFromMessage(msg), '44444444-4444-4444-4444-444444444444');
  });

  it('returns undefined on empty string', () => {
    assert.strictEqual(extractFallbackUuidFromMessage(''), undefined);
  });

  it('returns undefined when the message does not contain the token', () => {
    assert.strictEqual(extractFallbackUuidFromMessage('no token here'), undefined);
  });
});
