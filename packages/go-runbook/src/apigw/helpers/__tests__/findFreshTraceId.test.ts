import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ResultField } from '@aws-sdk/client-cloudwatch-logs';
import { findFreshTraceId, transformRawTraceId } from '../findFreshTraceId.js';

function row(fields: Record<string, string>): ResultField[] {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

describe('transformRawTraceId', () => {
  it('rewrites a 32-hex-char id into the X-Ray format', () => {
    assert.strictEqual(transformRawTraceId('3d472be72977635208a92722b97b5e24'), '1-3d472be7-2977635208a92722b97b5e24');
  });

  it('passes through an already-canonical id unchanged', () => {
    assert.strictEqual(
      transformRawTraceId('1-3d472be7-2977635208a92722b97b5e24'),
      '1-3d472be7-2977635208a92722b97b5e24',
    );
  });

  it('returns undefined for malformed inputs', () => {
    assert.strictEqual(transformRawTraceId('not-a-trace-id'), undefined);
    // Wrong length on the body of the canonical form.
    assert.strictEqual(transformRawTraceId('1-3d472be7-2977635208a92722b97b5e2'), undefined);
    // Wrong prefix.
    assert.strictEqual(transformRawTraceId('2-3d472be7-2977635208a92722b97b5e24'), undefined);
    // Wrong length on the raw form.
    assert.strictEqual(transformRawTraceId('3d472be72977635208a92722b97b5e2'), undefined);
    assert.strictEqual(transformRawTraceId(''), undefined);
  });
});

describe('findFreshTraceId', () => {
  it('returns the raw token together with its canonical form when fresh', () => {
    const rows = [row({ trace_id: '3d472be72977635208a92722b97b5e24', '@message': 'foo' })];
    const result = findFreshTraceId(rows, new Set());
    assert.deepStrictEqual(result, {
      raw: '3d472be72977635208a92722b97b5e24',
      canonical: '1-3d472be7-2977635208a92722b97b5e24',
    });
  });

  it('skips rows whose raw value is already in the known set', () => {
    const rows = [row({ trace_id: '3d472be72977635208a92722b97b5e24' })];
    const result = findFreshTraceId(rows, new Set(['3d472be72977635208a92722b97b5e24']));
    assert.strictEqual(result, undefined);
  });

  it('skips rows whose transformed value matches the current xRayTraceId', () => {
    const rows = [row({ trace_id: '3d472be72977635208a92722b97b5e24' })];
    const result = findFreshTraceId(rows, new Set(['1-3d472be7-2977635208a92722b97b5e24']));
    assert.strictEqual(result, undefined);
  });

  it('ignores malformed trace_id fields and keeps scanning', () => {
    const rows = [
      row({ trace_id: '-' }),
      row({ trace_id: 'not-hex' }),
      row({ trace_id: 'abcd1234abcd1234abcd1234abcd1234' }),
    ];
    const result = findFreshTraceId(rows, new Set());
    assert.deepStrictEqual(result, {
      raw: 'abcd1234abcd1234abcd1234abcd1234',
      canonical: '1-abcd1234-abcd1234abcd1234abcd1234',
    });
  });

  it('honours the `@trace_id` alias too', () => {
    const rows = [row({ '@trace_id': 'aabbccddeeff00112233445566778899' })];
    const result = findFreshTraceId(rows, new Set());
    assert.deepStrictEqual(result, {
      raw: 'aabbccddeeff00112233445566778899',
      canonical: '1-aabbccdd-eeff00112233445566778899',
    });
  });

  it('returns undefined when no row carries a trace_id field', () => {
    const rows = [row({ '@message': 'hello' })];
    assert.strictEqual(findFreshTraceId(rows, new Set()), undefined);
  });

  it('accepts a trace_id already in canonical form and reports raw === canonical', () => {
    const rows = [row({ trace_id: '1-3d472be7-2977635208a92722b97b5e24' })];
    const result = findFreshTraceId(rows, new Set());
    assert.deepStrictEqual(result, {
      raw: '1-3d472be7-2977635208a92722b97b5e24',
      canonical: '1-3d472be7-2977635208a92722b97b5e24',
    });
  });
});
