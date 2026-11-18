import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ServiceLogSchema } from '../ServiceLogSchema.js';
import { scanApplicationLogs } from '../scanApplicationLogs.js';
import { extractFallbackUuid } from '../../../../send/families/apigw/correlation/extractFallbackUuid.js';
import { logRow } from '../../../../../__tests__/helpers/logRow.js';

const SCHEMA: ServiceLogSchema = {
  messageFieldCandidates: ['message', '@message'],
  levelField: 'level',
  traceIdField: 'trace_id',
};

const RAW_32 = '6a1d12cde853a9726be9c7c20da54682';
const CANONICAL = '1-6a1d12cd-e853a9726be9c7c20da54682';

describe('scanApplicationLogs', () => {
  it('extracts Root from a compound AWS X-Ray trace header field', () => {
    const compound = `Self=1-6a1d12ce-111111111111111111111111;Root=${CANONICAL};Parent=0123456789abcdef;Sampled=0`;
    const scan = scanApplicationLogs([logRow({ level: 'ERROR', '@message': 'boom', trace_id: compound })], SCHEMA);

    assert.strictEqual(scan.traceIdCandidate?.raw, compound);
    assert.strictEqual(scan.traceIdCandidate?.canonical, CANONICAL);
  });

  it('keeps the first valid trace from the full log when trace_id contains a batch identifier', () => {
    const scan = scanApplicationLogs(
      [
        logRow({
          level: 'ERROR',
          message: 'Exception: first failure',
          trace_id: 'batch_id:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          '@message': JSON.stringify({ 'AWS-XRAY-TRACE-ID': `${CANONICAL}@0123456789abcdef` }),
        }),
        logRow({
          level: 'ERROR',
          message: 'Exception: latest failure',
          trace_id: '1-abcdef12-1234567890abcdef12345678',
        }),
      ],
      SCHEMA,
    );

    assert.deepStrictEqual(scan.traceIdCandidate, { raw: CANONICAL, canonical: CANONICAL });
    assert.strictEqual(scan.errorMessage, 'Exception: latest failure');
  });

  it('checks the full message for a labeled trace whether the preferred message is empty or present', () => {
    for (const message of ['', 'Exception: short description']) {
      const scan = scanApplicationLogs(
        [logRow({ level: 'ERROR', message, '@message': JSON.stringify({ trace_id: RAW_32 }) })],
        SCHEMA,
      );

      assert.deepStrictEqual(scan.traceIdCandidate, { raw: RAW_32, canonical: CANONICAL });
      assert.strictEqual(scan.errorMessage, message);
    }
  });

  it('prefers a valid structured trace field over a different trace in the full message', () => {
    const scan = scanApplicationLogs(
      [
        logRow({
          level: 'ERROR',
          message: 'Exception: failure',
          trace_id: RAW_32,
          '@message': 'Root=1-abcdef12-1234567890abcdef12345678',
        }),
      ],
      SCHEMA,
    );

    assert.deepStrictEqual(scan.traceIdCandidate, { raw: RAW_32, canonical: CANONICAL });
  });

  it('matches the label and the hex digits of a labeled trace id in any case', () => {
    const upper = RAW_32.toUpperCase();
    const scan = scanApplicationLogs([logRow({ level: 'ERROR', '@message': `TRACE-ID: ${upper}` })], SCHEMA);
    const longer = scanApplicationLogs([logRow({ level: 'ERROR', '@message': `traceId=${upper}F` })], SCHEMA);

    assert.strictEqual(scan.traceIdCandidate?.raw, upper);
    assert.strictEqual(longer.traceIdCandidate, undefined);
  });

  it('extracts the FALLBACK-UUID from the message with the injected product extractor', () => {
    const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const rows = [logRow({ level: 'ERROR', '@message': `retry FALLBACK-UUID:${uuid} done` })];

    assert.strictEqual(scanApplicationLogs(rows, SCHEMA, extractFallbackUuid).fallbackUuid, uuid);
    assert.strictEqual(scanApplicationLogs(rows, SCHEMA).fallbackUuid, undefined);
  });

  it('falls back to a keyword-matched message only when the log has no level field', () => {
    const scan = scanApplicationLogs(
      [
        logRow({ '@message': 'just an informational line' }),
        logRow({ '@message': 'NullPointer Error while processing' }),
      ],
      SCHEMA,
    );

    assert.strictEqual(scan.errorMessage, 'NullPointer Error while processing');
  });
});
