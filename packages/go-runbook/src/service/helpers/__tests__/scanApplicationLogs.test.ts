import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ResultField } from '@go-automation/go-common/aws';

import type { ServiceLogSchema } from '../../types/ServiceLogSchema.js';
import { scanApplicationLogs } from '../scanApplicationLogs.js';

const SCHEMA: ServiceLogSchema = {
  messageFieldCandidates: ['message', '@message'],
  levelField: 'level',
  traceIdField: 'trace_id',
};

const RAW_32 = '6a1d12cde853a9726be9c7c20da54682';
const CANONICAL = '1-6a1d12cd-e853a9726be9c7c20da54682';

function row(fields: Record<string, string>): ResultField[] {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

describe('scanApplicationLogs', () => {
  it('canonicalizes a 32-hex trace id taken from the trace_id field', () => {
    const scan = scanApplicationLogs([row({ level: 'ERROR', '@message': 'boom', trace_id: RAW_32 })], SCHEMA);

    assert.strictEqual(scan.traceIdCandidate?.raw, RAW_32);
    assert.strictEqual(scan.traceIdCandidate?.canonical, CANONICAL);
  });

  it('extracts an X-Ray trace id present in the message', () => {
    const scan = scanApplicationLogs([row({ level: 'ERROR', '@message': `failed Root=${CANONICAL} end` })], SCHEMA);

    assert.strictEqual(scan.traceIdCandidate?.canonical, CANONICAL);
  });

  it('extracts a labeled trace id embedded in a JSON message (no separate field)', () => {
    const scan = scanApplicationLogs([row({ level: 'ERROR', '@message': `{"trace_id":"${RAW_32}"}` })], SCHEMA);

    assert.strictEqual(scan.traceIdCandidate?.raw, RAW_32);
    assert.strictEqual(scan.traceIdCandidate?.canonical, CANONICAL);
  });

  it('does NOT treat a bare 32-hex token (e.g. MD5) as a trace id when unlabeled', () => {
    const scan = scanApplicationLogs(
      [row({ level: 'ERROR', '@message': 'computed md5 5d41402abc4b2a76b9719d911017c592 for payload' })],
      SCHEMA,
    );

    assert.strictEqual(scan.traceIdCandidate, undefined);
  });

  it('extracts the FALLBACK-UUID from the message', () => {
    const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const scan = scanApplicationLogs([row({ level: 'ERROR', '@message': `retry FALLBACK-UUID:${uuid} done` })], SCHEMA);

    assert.strictEqual(scan.fallbackUuid, uuid);
  });

  it('selects the longest error-level message as the error message', () => {
    const scan = scanApplicationLogs(
      [
        row({ level: 'ERROR', '@message': 'Exception: short' }),
        row({ level: 'ERROR', '@message': 'Exception: a considerably longer and more detailed error message' }),
      ],
      SCHEMA,
    );

    assert.strictEqual(scan.errorMessage, 'Exception: a considerably longer and more detailed error message');
  });
});
