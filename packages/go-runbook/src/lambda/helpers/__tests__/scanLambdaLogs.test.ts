import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ResultField } from '@go-automation/go-common/aws';

import { scanLambdaLogs } from '../scanLambdaLogs.js';

function row(message: string, timestamp = '2026-01-01T00:00:00.000Z'): ReadonlyArray<ResultField> {
  return [
    { field: '@timestamp', value: timestamp },
    { field: '@message', value: message },
  ];
}

const REPORT_TIMEOUT =
  'REPORT RequestId: d848f0c5-1089-5c2b-9a3b-91a94511ee52 Duration: 10000.00 ms Billed Duration: 10434 ms ' +
  'Memory Size: 128 MB Max Memory Used: 102 MB Status: timeout';

describe('scanLambdaLogs', () => {
  it('returns undefined for no rows', () => {
    assert.strictEqual(scanLambdaLogs([]), undefined);
  });

  it('classifies a bare REPORT timeout (no application error line)', () => {
    const scan = scanLambdaLogs([row(REPORT_TIMEOUT)]);
    assert.ok(scan !== undefined);
    assert.strictEqual(scan.category, 'timeout');
    assert.strictEqual(scan.requestId, 'd848f0c5-1089-5c2b-9a3b-91a94511ee52');
    assert.strictEqual(scan.report?.status, 'timeout');
    assert.strictEqual(scan.errorCount, 1);
  });

  it('prefers a real error line over runtime lines as the representative message', () => {
    const scan = scanLambdaLogs([
      row('START RequestId: 11111111-2222-3333-4444-555555555555 Version: $LATEST'),
      row('ERROR Invalid source details header QRCODE'),
      row(REPORT_TIMEOUT),
    ]);
    assert.ok(scan !== undefined);
    assert.strictEqual(scan.message, 'ERROR Invalid source details header QRCODE');
    // requestId is still recovered from the runtime lines
    assert.strictEqual(scan.requestId, '11111111-2222-3333-4444-555555555555');
    assert.strictEqual(scan.errorCount, 3);
  });
});
