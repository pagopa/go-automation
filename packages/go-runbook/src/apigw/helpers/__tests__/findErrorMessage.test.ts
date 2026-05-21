import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ResultField } from '@go-automation/go-common/aws';
import { scanServiceLogs } from '../scanServiceLogs.js';
import { SEND_API_GW_PROFILE } from '../../profiles/SEND_API_GW_PROFILE.js';

const SCHEMA = SEND_API_GW_PROFILE.serviceLog.schema;

function row(level: string, message: string): ResultField[] {
  const fields: ResultField[] = [{ field: 'message', value: message }];
  if (level !== '') {
    fields.push({ field: 'level', value: level });
  }
  return fields;
}

describe('scanServiceLogs errorMessage projection', () => {
  it('returns empty when there are no rows', () => {
    assert.strictEqual(scanServiceLogs([], SCHEMA).errorMessage, '');
  });

  it('picks the longest ERROR/WARN level row over any other row', () => {
    const rows: ReadonlyArray<ResultField[]> = [
      row('ERROR', 'short err'),
      row('DEBUG', 'a'.repeat(500)),
      row('WARN', 'b'.repeat(200)),
    ];
    const result = scanServiceLogs(rows, SCHEMA).errorMessage;
    assert.strictEqual(result.length, 200);
    assert.ok(result.startsWith('b'));
  });

  it('ignores DEBUG rows even if they contain "failed" as a substring', () => {
    const debugNoise = row(
      'DEBUG',
      'Delete data in DynamoDb table: pn-UserAttributes, key: VerificationCodeEntity(failedAttempts=0, codeValid=false)',
    );
    const realError = row(
      'ERROR',
      '[AUD_AB_DA_IO_INSUP] FAILURE - failed saving exception=nested exception is io.netty.handler.timeout.ReadTimeoutException',
    );
    const result = scanServiceLogs([debugNoise, realError], SCHEMA).errorMessage;
    assert.match(result, /AUD_AB_DA_IO_INSUP.*ReadTimeoutException/);
  });

  it('falls back to keyword detection when no row carries a level field', () => {
    const rows: ReadonlyArray<ResultField[]> = [row('', 'something noisy'), row('', 'NullPointerException at ...')];
    const result = scanServiceLogs(rows, SCHEMA).errorMessage;
    assert.strictEqual(result, 'NullPointerException at ...');
  });

  it('on keyword fallback, still ignores rows declaring a non-error level', () => {
    const rows: ReadonlyArray<ResultField[]> = [
      row('DEBUG', 'something failed during retry'),
      row('INFO', 'Exception raised but recovered'),
      row('', 'failed to acquire lock'),
    ];
    const result = scanServiceLogs(rows, SCHEMA).errorMessage;
    assert.strictEqual(result, 'failed to acquire lock');
  });

  it('returns empty string when no row qualifies under either pass', () => {
    const rows: ReadonlyArray<ResultField[]> = [row('DEBUG', 'all good'), row('INFO', 'still good')];
    assert.strictEqual(scanServiceLogs(rows, SCHEMA).errorMessage, '');
  });

  it('captures Lambda REPORT lines via `Status: timeout` keyword (no level field)', () => {
    const reportLine = row(
      '',
      'REPORT RequestId: 55fc51d5-694a-4e53-b736-7bbf815cd4fc\tDuration: 5000.00 ms\tBilled Duration: 5000 ms\tMemory Size: 512 MB\tMax Memory Used: 109 MB\tStatus: timeout',
    );
    const result = scanServiceLogs([reportLine], SCHEMA).errorMessage;
    assert.match(result, /Duration: 5000\.00 ms.*Status: timeout/);
  });

  it('captures Lambda REPORT lines via `Status: error` keyword', () => {
    const reportLine = row('', 'REPORT RequestId: abc Status: error');
    assert.strictEqual(scanServiceLogs([reportLine], SCHEMA).errorMessage, 'REPORT RequestId: abc Status: error');
  });
});
