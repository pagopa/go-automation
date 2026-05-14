import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ResultField } from '@aws-sdk/client-cloudwatch-logs';
import { findErrorMessage } from '../findErrorMessage.js';

function row(level: string, message: string): ResultField[] {
  const fields: ResultField[] = [{ field: 'message', value: message }];
  if (level !== '') {
    fields.push({ field: 'level', value: level });
  }
  return fields;
}

describe('findErrorMessage', () => {
  it('returns empty when there are no rows', () => {
    assert.strictEqual(findErrorMessage([]), '');
  });

  it('picks the longest ERROR/WARN level row over any other row', () => {
    const rows: ReadonlyArray<ResultField[]> = [
      row('ERROR', 'short err'),
      row('DEBUG', 'a'.repeat(500)),
      row('WARN', 'b'.repeat(200)),
    ];
    const result = findErrorMessage(rows);
    assert.strictEqual(result.length, 200);
    assert.ok(result.startsWith('b'));
  });

  it('ignores DEBUG rows even if they contain "failed" as a substring', () => {
    // Reproduces the regression observed on pn-address-book-io: a DEBUG
    // row carrying `failedAttempts=0` was outscoring the real ERROR.
    const debugNoise = row(
      'DEBUG',
      'Delete data in DynamoDb table: pn-UserAttributes, key: VerificationCodeEntity(failedAttempts=0, codeValid=false)',
    );
    const realError = row(
      'ERROR',
      '[AUD_AB_DA_IO_INSUP] FAILURE - failed saving exception=nested exception is io.netty.handler.timeout.ReadTimeoutException',
    );
    const result = findErrorMessage([debugNoise, realError]);
    assert.match(result, /AUD_AB_DA_IO_INSUP.*ReadTimeoutException/);
  });

  it('falls back to keyword detection when no row carries a level field', () => {
    const rows: ReadonlyArray<ResultField[]> = [row('', 'something noisy'), row('', 'NullPointerException at ...')];
    const result = findErrorMessage(rows);
    assert.strictEqual(result, 'NullPointerException at ...');
  });

  it('on keyword fallback, still ignores rows declaring a non-error level', () => {
    // Mixed bag with no ERROR/WARN rows: only the levelless row should
    // be eligible for keyword matching.
    const rows: ReadonlyArray<ResultField[]> = [
      row('DEBUG', 'something failed during retry'),
      row('INFO', 'Exception raised but recovered'),
      row('', 'failed to acquire lock'),
    ];
    const result = findErrorMessage(rows);
    assert.strictEqual(result, 'failed to acquire lock');
  });

  it('returns empty string when no row qualifies under either pass', () => {
    const rows: ReadonlyArray<ResultField[]> = [row('DEBUG', 'all good'), row('INFO', 'still good')];
    assert.strictEqual(findErrorMessage(rows), '');
  });

  it('captures Lambda REPORT lines via `Status: timeout` keyword (no level field)', () => {
    // Lambda runtime emits REPORT lines without a `level` field. They do
    // not contain any of the generic error keywords (Exception/Error/
    // failed/FAILURE) but they end with `Status: timeout` when the
    // invocation hit the configured timeout.
    const reportLine = row(
      '',
      'REPORT RequestId: 55fc51d5-694a-4e53-b736-7bbf815cd4fc\tDuration: 5000.00 ms\tBilled Duration: 5000 ms\tMemory Size: 512 MB\tMax Memory Used: 109 MB\tStatus: timeout',
    );
    const result = findErrorMessage([reportLine]);
    assert.match(result, /Duration: 5000\.00 ms.*Status: timeout/);
  });

  it('captures Lambda REPORT lines via `Status: error` keyword', () => {
    const reportLine = row('', 'REPORT RequestId: abc Status: error');
    assert.strictEqual(findErrorMessage([reportLine]), 'REPORT RequestId: abc Status: error');
  });
});
