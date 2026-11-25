import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseLambdaReportLine } from '../parseLambdaReportLine.js';

const REPORT =
  'REPORT RequestId: d848f0c5-1089-5c2b-9a3b-91a94511ee52  Duration: 10000.00 ms Billed Duration: 10434 ms   ' +
  'Memory Size: 128 MB Max Memory Used: 102 MB Init Duration: 433.75 ms    Status: timeout';

describe('parseLambdaReportLine', () => {
  it('returns undefined for non-REPORT lines', () => {
    assert.strictEqual(parseLambdaReportLine('START RequestId: x'), undefined);
    assert.strictEqual(parseLambdaReportLine('[ERROR] boom'), undefined);
  });

  it('parses all REPORT fields, distinguishing Duration from Billed Duration', () => {
    const info = parseLambdaReportLine(REPORT);
    assert.ok(info !== undefined);
    assert.strictEqual(info.requestId, 'd848f0c5-1089-5c2b-9a3b-91a94511ee52');
    assert.strictEqual(info.durationMs, 10000);
    assert.strictEqual(info.billedDurationMs, 10434);
    assert.strictEqual(info.memorySizeMb, 128);
    assert.strictEqual(info.maxMemoryUsedMb, 102);
    assert.strictEqual(info.status, 'timeout');
  });
});
